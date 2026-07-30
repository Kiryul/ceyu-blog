---
title: 一文吃透 Java 泛型：从 List<T> 到通配符 ? extends
date: 2026-07-31 11:00:00
categories: 技术博文
tags: [Java, 泛型, 通配符]
---

这是「Java 从基础到实战」系列的第 3 篇。上一篇我们大量使用了 `List<String>`、`Map<String, Integer>` 这样的写法，这对尖括号就是泛型。本文不从概念出发，而是从一个真实需求开始，一步步推导出「为什么需要泛型 → 泛型类 → 泛型方法 → 通配符」的完整演进路线。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

泛型是很多初学者「会用但说不清」的知识点：会写 `List<String>`，但看到 `<T extends Comparable<? super T>>` 就头晕。本文的目标是让你看完后能自己写泛型类和泛型方法，并彻底搞懂 `? extends` 和 `? super` 什么时候用。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 IDEA 的 `java-basics` 项目中，右键 `src` 目录 → `New → Package`，创建包 `generic`，本文所有类都放在这个包下。

## 步骤 1：回到没有泛型的年代，看看问题在哪

JDK 5 之前没有泛型，集合里存的都是 `Object`。新建 `WithoutGenericDemo.java` 体验一下：

```java
package generic;

import java.util.ArrayList;
import java.util.List;

public class WithoutGenericDemo {
    public static void main(String[] args) {
        List names = new ArrayList();   // 原始类型（raw type），没有尖括号
        names.add("张三");
        names.add("李四");
        names.add(60);                  // 编译器不拦你：塞进一个 Integer

        for (Object obj : names) {
            String name = (String) obj;   // 必须手动强转
            System.out.println(name.length());
        }
    }
}
```

运行结果：

```
2
2
Exception in thread "main" java.lang.ClassCastException:
    class java.lang.Integer cannot be cast to class java.lang.String
```

问题很清楚：**错误发生在运行时，而不是编译时**。塞错数据的那一行编译器不报错，等到线上运行才炸。

把第一行改成泛型写法：

```java
List<String> names = new ArrayList<>();
names.add("张三");
names.add(60);   // 编译直接报错：required: String, found: int
```

这就是泛型的核心价值：**把运行时的 ClassCastException 提前到编译期发现，并省掉手动强转**。

## 步骤 2：泛型类 —— 手写一个统一返回结果 Result<T>

真实需求：接口开发中，所有方法都要返回「状态码 + 提示信息 + 数据」，但**数据的类型每个接口都不一样**——查用户返回 `User`，查列表返回 `List<User>`。

用泛型类一次解决。新建 `Result.java`：

```java
package generic;

/**
 * 统一返回结果：T 是类型参数，使用时才确定具体类型
 */
public class Result<T> {
    private final int code;
    private final String message;
    private final T data;

    private Result(int code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    // 成功：数据类型由调用方决定
    public static <T> Result<T> ok(T data) {
        return new Result<>(200, "success", data);
    }

    // 失败：没有数据，用 Void 占位
    public static Result<Void> fail(int code, String message) {
        return new Result<>(code, message, null);
    }

    public T getData() { return data; }

    @Override
    public String toString() {
        return "Result{code=" + code + ", message='" + message + "', data=" + data + "}";
    }
}
```

新建 `ResultDemo.java` 验证：

```java
package generic;

import java.util.List;

public class ResultDemo {
    record User(String name, int age) {}

    public static void main(String[] args) {
        // 同一个 Result 类，装什么类型由使用处决定
        Result<User> r1 = Result.ok(new User("张三", 20));
        Result<List<String>> r2 = Result.ok(List.of("Java", "泛型"));
        Result<Void> r3 = Result.fail(404, "用户不存在");

        System.out.println(r1);
        System.out.println(r2);
        System.out.println(r3);

        User user = r1.getData();   // 无需强转，直接拿到 User 类型
        System.out.println("用户名：" + user.name());
    }
}
```

预期输出：

```
Result{code=200, message='success', data=User[name=张三, age=20]}
Result{code=200, message='success', data=[Java, 泛型]}
Result{code=404, message='用户不存在', data=null}
用户名：张三
```

这就是后面 Spring Boot 实战篇会天天用的「统一返回体」，你现在已经自己写出来了。

## 步骤 3：泛型方法 —— 类型参数写在方法上

需求：写一个工具方法，返回任意列表的第一个元素，列表为空则返回默认值。

新建 `GenericMethodDemo.java`：

```java
package generic;

import java.util.List;

public class GenericMethodDemo {

    // 方法返回值前的 <T> 声明这是一个泛型方法
    public static <T> T firstOrDefault(List<T> list, T defaultValue) {
        return list.isEmpty() ? defaultValue : list.get(0);
    }

    public static void main(String[] args) {
        // T 由编译器根据实参自动推断，无需显式指定
        String s = firstOrDefault(List.of("A", "B"), "无");
        Integer i = firstOrDefault(List.of(), 0);

        System.out.println(s);   // A
        System.out.println(i);   // 0
    }
}
```

对比记忆：

- **泛型类**：`class Result<T>` —— 类型参数跟着对象走，创建对象时确定；
- **泛型方法**：`static <T> T firstOrDefault(...)` —— 类型参数只在本次调用内有效，每次调用可以不同。

## 步骤 4：通配符 —— 为什么 List&lt;Integer&gt; 不能赋给 List&lt;Number&gt;

先看一个反直觉的现象：

```java
Integer 是 Number 的子类，但——
List<Number> nums = new ArrayList<Integer>();   // 编译报错！
```

为什么不行？假设允许，就能通过 `nums.add(3.14)` 往里塞 Double，那原来的 `List<Integer>` 就被污染了。所以 Java 规定：**泛型不支持这种父子关系传递（不型变）**，需要用通配符表达。

### `? extends T`：只读取，不写入（生产者）

需求：写一个方法计算「任意数字列表」的总和，`List<Integer>`、`List<Double>` 都要能传进来。

新建 `WildcardDemo.java`：

```java
package generic;

import java.util.ArrayList;
import java.util.List;

public class WildcardDemo {

    // ? extends Number：接受 Number 及其任意子类的列表
    public static double sum(List<? extends Number> list) {
        double total = 0;
        for (Number n : list) {      // 读取：一定是 Number，安全
            total += n.doubleValue();
        }
        return total;
    }

    // ? super Integer：接受 Integer 及其任意父类的列表
    public static void fillNumbers(List<? super Integer> list) {
        for (int i = 1; i <= 3; i++) {
            list.add(i);             // 写入 Integer：一定装得下，安全
        }
    }

    public static void main(String[] args) {
        System.out.println(sum(List.of(1, 2, 3)));         // List<Integer> ✓
        System.out.println(sum(List.of(1.5, 2.5)));        // List<Double>  ✓

        List<Number> container = new ArrayList<>();
        fillNumbers(container);                            // List<Number> 是 Integer 的父类列表 ✓
        System.out.println(container);
    }
}
```

预期输出：

```
6.0
4.0
[1, 2, 3]
```

### PECS 原则一句话记忆

> **P**roducer **E**xtends, **C**onsumer **S**uper —— 只从集合里**读**（它是生产者）用 `? extends`；只往集合里**写**（它是消费者）用 `? super`；又读又写就别用通配符，老老实实写 `List<T>`。

JDK 源码 `Collections.copy` 就是教科书示范：

```java
public static <T> void copy(List<? super T> dest, List<? extends T> src)
//                          写入目标用 super      读取来源用 extends
```

## 常见坑

### 坑 1：继续使用原始类型（raw type）

**错误示范** ❌：

```java
List list = new ArrayList();     // IDEA 会黄色警告：Raw use of parameterized class
list.add("张三");
list.add(123);                   // 编译器不拦，隐患埋下
```

**正确写法**：永远带上类型参数，哪怕暂时只能确定是 Object ✅

```java
List<String> list = new ArrayList<>();   // 右边菱形语法 <> 自动推断
```

### 坑 2：往 `? extends` 的集合里写入元素

**错误示范** ❌：

```java
public static double sum(List<? extends Number> list) {
    list.add(1);   // 编译报错！
    ...
}
```

**原因**：`? extends Number` 意味着「Number 的某个未知子类」——可能是 `List<Double>`，往里塞 Integer 显然不行，编译器索性禁止一切写入（`null` 除外）。

**正确写法**：需要写入时改用 `? super` ✅（见步骤 4 的 `fillNumbers`）。

### 坑 3：用 instanceof 判断泛型的具体类型

**错误示范** ❌：

```java
if (list instanceof List<String>) {   // 编译报错
```

**原因**：Java 泛型是**编译期擦除**的——运行时 `List<String>` 和 `List<Integer>` 都只是 `List`，类型参数信息已不存在，所以运行时无法区分。

**正确写法**：只判断原始类型，元素类型靠泛型声明在编译期保证 ✅

```java
if (list instanceof List<?>) {
```

> 💡 这也解释了为什么不能 `new T()`、不能 `new T[10]`——运行时根本不知道 T 是谁。

## 小结

本文沿着「问题 → 方案」的路线走完了泛型的主干：

- ✅ 泛型的本质：把类型错误从运行时提前到编译期，省掉强转
- ✅ 泛型类 `Result<T>`：亲手实现了 Spring 项目标配的统一返回体
- ✅ 泛型方法 `<T> T firstOrDefault(...)`：类型随调用自动推断
- ✅ 通配符 PECS 原则：读用 `? extends`，写用 `? super`
- ✅ 三个坑：拒绝 raw type、`? extends` 禁止写入、擦除导致运行时无泛型

下一篇进入代码健壮性话题：**《Java 异常处理最佳实践：try-with-resources 与自定义异常》**，用「错误写法 → 正确写法」的对照重构，看看异常到底该怎么捕、怎么抛，敬请期待。

> 上一篇：《Java 集合框架实战：ArrayList、HashMap 该怎么选怎么用》
> 本系列完整目录见博客「技术博文」分类，每两周更新一篇。
