---
title: Java 反射与注解实战：手写一个迷你 @Autowired
date: 2026-08-09 10:00:00
categories: 技术博文
tags: [Java, 反射, 注解, 依赖注入]
---

这是「Java 从基础到实战」系列的第 12 篇。Spring 的 @Autowired 看起来像魔法：加个注解，对象就自动注入了。本文用反射 + 自定义注解，从 0 写一个 60 行的迷你依赖注入容器，写完你就知道魔法背后只是三步基本功。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

反射和注解单独学都很枯燥，但它们组合起来就是所有 Java 框架的地基。本文的路线：反射三板斧 → 自定义注解 → 组装成迷你 IoC 容器。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `reflect`。

## 步骤 1：反射三板斧 —— 拿类、建对象、操作成员

新建 `ReflectBasic.java`：

```java
package reflect;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

public class ReflectBasic {
    static class User {
        private String name = "初始值";
        public String hello(String who) { return name + " 对 " + who + " 说你好"; }
    }

    public static void main(String[] args) throws Exception {
        // 板斧 1：获取 Class 对象（三种方式，最常用第一种）
        Class<?> clazz = Class.forName("reflect.ReflectBasic$User");
        // 等价：User.class 或 userInstance.getClass()

        // 板斧 2：创建实例（JDK 9+ 推荐通过构造器）
        Object user = clazz.getDeclaredConstructor().newInstance();

        // 板斧 3a：操作私有字段
        Field nameField = clazz.getDeclaredField("name");
        nameField.setAccessible(true);            // 突破 private 限制
        nameField.set(user, "张三");

        // 板斧 3b：调用方法
        Method hello = clazz.getMethod("hello", String.class);
        System.out.println(hello.invoke(user, "李四"));
    }
}
```

预期输出：

```
张三 对 李四 说你好
```

一句话总结反射：**在运行时把「类、字段、方法」当作普通数据来读取和操作**。框架不知道你会写什么类，只能在运行时用反射来「认识」它们。

## 步骤 2：自定义注解 —— 给代码打标签

注解本身什么都不做，它只是**可被反射读取的标签**。新建两个注解：

```java
package reflect;

import java.lang.annotation.*;

/** 标记：这个类交给容器管理（对标 Spring 的 @Component） */
@Retention(RetentionPolicy.RUNTIME)   // 保留到运行时，反射才能读到！
@Target(ElementType.TYPE)             // 只能标在类上
public @interface MiniComponent {}
```

```java
package reflect;

import java.lang.annotation.*;

/** 标记：这个字段需要容器注入（对标 Spring 的 @Autowired） */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)            // 只能标在字段上
public @interface MiniAutowired {}
```

> ⚠️ `@Retention(RUNTIME)` 是灵魂：默认注解只保留在源码/字节码里，运行时读不到。写框架注解必须显式声明 RUNTIME。

## 步骤 3：写业务类，用上我们的注解

```java
package reflect;

@MiniComponent
public class UserRepository {
    public String findById(long id) { return "用户#" + id; }
}
```

```java
package reflect;

@MiniComponent
public class UserService {
    @MiniAutowired
    private UserRepository userRepository;   // 我们不 new，等容器注入

    public String getUser(long id) {
        return "查询到 " + userRepository.findById(id);
    }
}
```

注意 `UserService` 里**没有任何一行 new UserRepository()**——这正是「控制反转」：对象的创建和装配交给容器。

## 步骤 4：手写迷你 IoC 容器（核心 60 行）

新建 `MiniContainer.java`：

```java
package reflect;

import java.io.File;
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

public class MiniContainer {
    /** 单例池：类型 -> 实例（对标 Spring 的 singletonObjects） */
    private final Map<Class<?>, Object> beans = new HashMap<>();

    public MiniContainer(String packageName) throws Exception {
        scanAndCreate(packageName);   // 第一阶段：扫描 + 实例化
        injectFields();               // 第二阶段：依赖注入
    }

    /** 扫描包下所有 class 文件，把标了 @MiniComponent 的实例化 */
    private void scanAndCreate(String packageName) throws Exception {
        String path = packageName.replace('.', '/');
        File dir = new File(Thread.currentThread().getContextClassLoader()
                .getResource(path).toURI());

        for (File f : dir.listFiles((d, name) -> name.endsWith(".class"))) {
            String className = packageName + "." + f.getName().replace(".class", "");
            Class<?> clazz = Class.forName(className);
            if (clazz.isAnnotationPresent(MiniComponent.class)) {   // 读标签
                beans.put(clazz, clazz.getDeclaredConstructor().newInstance());
                System.out.println("[容器] 创建 Bean: " + clazz.getSimpleName());
            }
        }
    }

    /** 遍历每个 Bean 的字段，标了 @MiniAutowired 的从单例池取值塞进去 */
    private void injectFields() throws Exception {
        for (Object bean : beans.values()) {
            for (Field field : bean.getClass().getDeclaredFields()) {
                if (field.isAnnotationPresent(MiniAutowired.class)) {
                    Object dependency = beans.get(field.getType());   // 按类型查找
                    if (dependency == null) {
                        throw new IllegalStateException("找不到依赖: " + field.getType());
                    }
                    field.setAccessible(true);
                    field.set(bean, dependency);                      // 反射注入！
                    System.out.printf("[容器] 注入 %s.%s%n",
                            bean.getClass().getSimpleName(), field.getName());
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    public <T> T getBean(Class<T> type) { return (T) beans.get(type); }
}
```

## 步骤 5：见证魔法

```java
package reflect;

public class MiniContainerTest {
    public static void main(String[] args) throws Exception {
        MiniContainer container = new MiniContainer("reflect");

        UserService service = container.getBean(UserService.class);
        System.out.println(service.getUser(42));
    }
}
```

预期输出：

```
[容器] 创建 Bean: UserRepository
[容器] 创建 Bean: UserService
[容器] 注入 UserService.userRepository
查询到 用户#42
```

复盘一下，所谓依赖注入就三步：

1. **扫描**：找出标了 `@MiniComponent` 的类，反射实例化，放进单例 Map；
2. **注入**：遍历字段，标了 `@MiniAutowired` 的按类型从 Map 取出，`field.set` 塞入；
3. **取用**：`getBean` 直接从 Map 拿。

Spring 当然复杂得多（三级缓存解决循环依赖、AOP 代理、生命周期回调……），但**主干逻辑与这 60 行完全同构**。到了阶段三学 Spring Boot 时，你看到 @Autowired 心里会有底。

## 常见坑

### 坑 1：注解忘写 @Retention(RUNTIME)，反射死活读不到

**错误示范** ❌：

```java
@Target(ElementType.FIELD)
public @interface MiniAutowired {}   // 默认 RetentionPolicy.CLASS，运行时不可见
// clazz.isAnnotationPresent(...) 永远返回 false，且不报错，极难排查
```

**正确写法**：框架类注解一律显式 `@Retention(RetentionPolicy.RUNTIME)` ✅。

### 坑 2：getFields 和 getDeclaredFields 分不清

**错误示范** ❌：`clazz.getFields()` 只能拿到 **public** 字段（含父类），私有字段全被漏掉，注入悄无声息地失败。

**正确写法**：拿本类全部字段（含 private）用 `getDeclaredFields()`，配合 `setAccessible(true)` ✅。方法同理：`getMethods` vs `getDeclaredMethods`。

### 坑 3：在热点路径上反复反射，性能被拖垮

**错误示范** ❌：每次请求都 `Class.forName` + `getDeclaredField` 一遍。反射调用比直接调用慢一个数量级以上。

**正确写法**：框架的做法是**启动时反射一次，把 Field/Method 缓存起来**反复用 ✅——我们的容器把实例缓存在 Map 里正是这个思路。

## 小结

- ✅ 反射三板斧：`Class.forName` → `newInstance` → `field.set` / `method.invoke`
- ✅ 注解 = 运行时可读的标签，`@Retention(RUNTIME)` 是生命线
- ✅ 60 行手写 IoC：扫描 → 实例化 → 按类型注入，Spring 的主干同构
- ✅ 反射结果要缓存，别在热点路径上现查

下一篇玩点更硬核的：**《Java 网络编程：从 Socket 到手写一个简易 HTTP 服务器》**，200 行代码让浏览器访问你自己写的服务器，敬请期待。

> 上一篇：《JVM 垃圾回收入门：GC 算法、G1 收集器与调优参数实操》
> 本系列完整目录见博客「技术博文」分类。
