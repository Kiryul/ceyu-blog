---
title: JDK 17/21 新特性实战：Record、密封类、虚拟线程
date: 2026-08-11 10:00:00
categories: 技术博文
tags: [Java, JDK 21, 虚拟线程, Record]
---

这是「Java 从基础到实战」系列的第 14 篇，阶段二「进阶硬核」收官。本文精选 JDK 17/21 两个 LTS 版本最值得马上用起来的特性：Record、密封类、模式匹配 switch，压轴是虚拟线程 vs 传统线程池的万级任务压测对比。前三节 JDK 17 可跑，虚拟线程需 JDK 21。

<!-- more -->

## 前言

很多团队还停在「Java 8 语法 + JDK 17 运行」的状态，白白浪费了新版本的表达力。本文每个特性都用「旧写法 → 新写法」对照展示，看完就能在项目里用。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（虚拟线程部分需 21，IDEA 中 `File → Project Structure → SDK` 可再添加一个 JDK 21） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `modern`。

## 特性 1：Record —— 一行顶五十行的数据类

**旧写法** ❌（Java 8 时代的 DTO）：

```java
public class UserDto {
    private final Long id;
    private final String name;
    // 构造器 + 3 个 getter + equals + hashCode + toString ≈ 50 行样板代码
}
```

**新写法** ✅（JDK 16+）：

```java
package modern;

public record UserDto(Long id, String name) {}
```

一行自动获得：全参构造器、`id()`/`name()` 访问器、基于全字段的 `equals`/`hashCode`、可读的 `toString`。还能加校验和静态工厂：

```java
public record UserDto(Long id, String name) {
    public UserDto {                          // 紧凑构造器：入参校验
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 不能为空");
        }
    }
    public static UserDto of(long id, String name) { return new UserDto(id, name); }
}
```

适用边界：**不可变的数据载体**（DTO、VO、配置项、Map 的复合 key）。要可变字段、要继承的场景仍用普通类。

## 特性 2：密封类 —— 把继承关系管起来

需求：支付结果只可能是「成功 / 失败 / 处理中」三种，不允许别人再扩展。**旧写法**只能靠文档约定；**新写法**（JDK 17）用 `sealed` 在编译期锁死：

```java
package modern;

public sealed interface PayResult permits PayResult.Success, PayResult.Fail, PayResult.Pending {
    record Success(String orderNo, long amount) implements PayResult {}
    record Fail(String reason) implements PayResult {}
    record Pending() implements PayResult {}
}
```

配合 JDK 21 的**模式匹配 switch**，分支处理优雅且编译器强制穷尽：

```java
package modern;

public class PayHandler {
    static String handle(PayResult result) {
        return switch (result) {
            case PayResult.Success s -> "支付成功: %s，金额 %d 分".formatted(s.orderNo(), s.amount());
            case PayResult.Fail f    -> "支付失败: " + f.reason();
            case PayResult.Pending p -> "处理中，请稍候";
            // 不需要 default！编译器知道只有三种可能
            // 如果未来新增一种实现，这里会直接编译报错，逼你处理——这就是价值
        };
    }

    public static void main(String[] args) {
        System.out.println(handle(new PayResult.Success("NO123", 9900)));
        System.out.println(handle(new PayResult.Fail("余额不足")));
    }
}
```

预期输出：

```
支付成功: NO123，金额 9900 分
支付失败: 余额不足
```

## 特性 3：其他即拿即用的小甜点

```java
// 文本块（JDK 15+）：告别字符串拼接 SQL/JSON
String json = """
        {
          "name": "张三",
          "age": 20
        }
        """;

// instanceof 模式匹配（JDK 16+）：判断和强转合二为一
// 旧：if (obj instanceof String) { String s = (String) obj; ... }
if (obj instanceof String s && s.length() > 3) {
    System.out.println(s.toUpperCase());
}

// switch 表达式箭头语法（JDK 14+）：不再怕忘写 break
int days = switch (month) {
    case 1, 3, 5, 7, 8, 10, 12 -> 31;
    case 4, 6, 9, 11 -> 30;
    default -> 28;
};
```

## 特性 4（压轴）：虚拟线程 —— JDK 21 的王牌

平台线程（传统线程）1:1 映射操作系统线程，默认栈 1MB，几千个就到极限。虚拟线程由 JVM 调度，**栈按需增长（初始约几 KB），阻塞时自动让出底层线程**，百万级也不在话下。IO 密集型任务是它的主场。

压测：10 000 个任务，每个模拟 100ms 的 IO 等待（需 JDK 21 运行）：

```java
package modern;

import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VirtualThreadBench {
    static final int TASKS = 10_000;

    public static void main(String[] args) throws Exception {
        // 方案 A：200 线程的传统线程池
        try (ExecutorService pool = Executors.newFixedThreadPool(200)) {
            bench("平台线程池(200)", pool);
        }
        // 方案 B：虚拟线程，每任务一线程
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            bench("虚拟线程", pool);
        }
    }

    static void bench(String name, ExecutorService pool) throws Exception {
        long start = System.currentTimeMillis();
        for (int i = 0; i < TASKS; i++) {
            pool.submit(() -> {
                Thread.sleep(Duration.ofMillis(100));   // 模拟 IO 等待
                return null;
            });
        }
        pool.shutdown();
        pool.awaitTermination(1, java.util.concurrent.TimeUnit.MINUTES);
        System.out.printf("%s 完成 %d 个任务耗时: %d ms%n",
                name, TASKS, System.currentTimeMillis() - start);
    }
}
```

笔者机器实测输出：

```
平台线程池(200) 完成 10000 个任务耗时: 5183 ms
虚拟线程 完成 10000 个任务耗时: 253 ms
```

**20 倍差距**。原理：线程池只有 200 个工人，10 000 个 100ms 任务至少要 50 批 ≈ 5 秒；虚拟线程直接开 10 000 个，全部并行等待，理论下限就是 100ms + 调度开销。

使用姿势就一句话：`Executors.newVirtualThreadPerTaskExecutor()`，**不要池化虚拟线程**（它创建成本极低，池化反而画蛇添足）。

## 常见坑

### 坑 1：Record 当 JPA/MyBatis 实体用

**错误示范** ❌：`public record User(Long id, String name)` 映射数据库表。ORM 框架需要无参构造 + setter 来回填字段，Record 全不可变，直接报错或字段全空。

**正确写法**：**实体类用普通类，对外传输的 DTO 用 Record** ✅。

### 坑 2：虚拟线程里跑 CPU 密集任务

**错误认知** ❌：「虚拟线程快，什么任务都换成它」。

**正确理解** ✅：虚拟线程只在**阻塞等待**（IO、sleep、锁）时产生收益；纯计算任务底层还是那几个 CPU 核心，换虚拟线程零提升甚至更慢。CPU 密集任务继续用 `newFixedThreadPool(核数)`。

### 坑 3：虚拟线程 + synchronized 长临界区导致「钉住」

**错误示范** ❌：虚拟线程在 `synchronized` 块内做 IO——JDK 21 中这会把虚拟线程「钉」在底层平台线程上无法让出（pinning），并发优势全失。

**正确写法**：虚拟线程环境下的长临界区用 `ReentrantLock` 替代 synchronized ✅（第 8 篇的知识闭环了）。JDK 24 起该限制已被移除，但 21 上仍需注意。

## 小结

- ✅ Record：一行数据类，DTO 场景无脑用
- ✅ sealed + 模式匹配 switch：受控继承 + 编译期穷尽检查
- ✅ 文本块 / instanceof 模式匹配 / switch 表达式：即拿即用
- ✅ 虚拟线程：IO 密集场景 20 倍吞吐，`newVirtualThreadPerTaskExecutor` 一行开启

阶段二「进阶硬核」完结 🎉。下一篇进入阶段三「生态与框架」：**《Maven 从入门到熟练：依赖管理、多模块、常用命令速查》**，敬请期待。

> 上一篇：《Java 网络编程：从 Socket 到手写一个简易 HTTP 服务器》
> 本系列完整目录见博客「技术博文」分类。
