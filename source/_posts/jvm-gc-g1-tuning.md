---
title: JVM 垃圾回收入门：GC 算法、G1 收集器与调优参数实操
date: 2026-08-08 10:00:00
categories: 技术博文
tags: [Java, JVM, 垃圾回收, G1]
---

这是「Java 从基础到实战」系列的第 11 篇。上一篇我们在 OOM 前看到了 GC 的挣扎日志，这一篇就把 GC 讲透：对象怎么被判死、三种回收算法、G1 的工作方式，以及 `-Xlog:gc` 日志的逐字段解读。所有实验在 JDK 17（默认 G1）下可复现。

<!-- more -->

## 前言

GC 调优的第一步不是背参数，而是**会看日志**。本文先用 20 行代码制造一场 GC，再逐字段拆日志，最后给出一套可以直接抄的生产参数模板。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（默认收集器即 G1） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目的 `jvm` 包中继续实验。

## 步骤 1：对象什么时候「该死」—— 可达性分析

JVM 判断对象存活不是数引用（引用计数无法处理循环引用），而是**可达性分析**：从 GC Roots（栈上的局部变量、静态变量、常量等）出发顺着引用链走，走不到的对象就是垃圾。

```java
package jvm;

public class ReachabilityDemo {
    static byte[] cache;                     // 静态变量：GC Root

    public static void main(String[] args) {
        byte[] a = new byte[1024 * 1024];    // 栈引用 a → 可达，活
        cache = new byte[1024 * 1024];       // 静态引用 → 可达，活

        a = null;                            // 断开引用 → 第一个数组不可达
        System.gc();                         // 建议 JVM 回收（仅实验用！）
        // 此时第一个 1MB 可被回收，cache 指向的仍然存活
    }
}
```

## 步骤 2：三种基础回收算法，30 秒看懂

| 算法 | 思路 | 缺点 | 用在哪 |
|------|------|------|--------|
| 标记-清除 | 标记垃圾，原地清掉 | 内存碎片 | 老年代（CMS） |
| 标记-复制 | 活对象整体搬到另一半空间 | 浪费一半空间 | 新生代（活对象少，搬得快） |
| 标记-整理 | 活对象向一端压缩 | 移动成本高 | 老年代 |

分代假设：**绝大多数对象朝生夕死**。所以堆分成新生代（复制算法，频繁小规模回收 = Young GC）和老年代（整理算法，罕见大规模回收 = Full GC，要极力避免）。

## 步骤 3：G1 —— JDK 9+ 的默认收集器

G1（Garbage-First）不再物理划分新生代/老年代，而是把堆切成上千个等大的 **Region**（1~32MB），每个 Region 动态扮演 Eden / Survivor / Old 角色。回收时优先挑「垃圾最多、回收收益最大」的 Region 下手——这就是名字 Garbage-First 的由来。

核心优势：**可预测的停顿时间**。你告诉它「每次暂停别超过 100ms」（`-XX:MaxGCPauseMillis=100`），它就按这个预算挑选本轮回收多少个 Region。

## 步骤 4：制造一场 GC 并解读日志

新建 `GcLogDemo.java`，VM options 填：

```
-Xmx64m -Xms64m -Xlog:gc
```

```java
package jvm;

import java.util.ArrayList;
import java.util.List;

public class GcLogDemo {
    public static void main(String[] args) throws InterruptedException {
        List<byte[]> keep = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            byte[] data = new byte[1024 * 1024];   // 每轮 1MB 临时对象（垃圾）
            if (i % 10 == 0) {
                keep.add(new byte[512 * 1024]);    // 每 10 轮留 0.5MB 活对象
            }
            Thread.sleep(20);
        }
        System.out.println("完成，存活对象: " + keep.size() + " 个");
    }
}
```

运行后控制台会持续输出 GC 日志，取一条典型的逐字段解读：

```
[0.812s][info][gc] GC(6) Pause Young (Normal) (G1 Evacuation Pause) 38M->12M(64M) 2.115ms
 │        │        │     │                     │                    │            │
 │        │        │     │                     │                    │            └ 本次停顿 2.1ms
 │        │        │     │                     │                    └ 回收前38M → 回收后12M（总堆64M）
 │        │        │     │                     └ 触发原因：G1 疏散暂停
 │        │        │     └ Young GC（只回收新生代 Region）
 │        │        └ 第 6 次 GC
 │        └ 日志级别
 └ JVM 启动后的秒数
```

判读口诀：

- `Pause Young` 频繁但毫秒级 → **正常**，朝生夕死的垃圾被高效清理；
- `38M->12M` 降幅大 → 说明大部分是临时对象，健康；
- 出现 `Pause Full` → **报警信号**，说明老年代满了，需要排查是否有对象泄漏或堆太小；
- Full GC 后 `17M->17M` 几乎不降 → 离 OOM 一步之遥（上一篇结尾看到的正是这个）。

## 步骤 5：可以直接抄的参数模板

```
# —— 生产通用模板（4C8G 机器、Web 应用为例）——
-Xms4g -Xmx4g                          # 堆初始=最大，避免运行中扩缩容抖动
-XX:MaxGCPauseMillis=100               # G1 停顿目标 100ms（默认 200）
-Xlog:gc*:file=logs/gc.log:time,uptime:filecount=5,filesize=20M
                                       # GC 日志滚动输出到文件
-XX:+HeapDumpOnOutOfMemoryError        # OOM 自动留 dump
-XX:HeapDumpPath=logs/
```

调优三原则：

1. **先看日志再动手**：没有 Full GC、Young GC 停顿在几十毫秒内 → 不需要调优；
2. **首选加堆内存**，其次调 `MaxGCPauseMillis`，最后才考虑换收集器；
3. 每次只改一个参数，用压测对比前后 GC 日志。

## 常见坑

### 坑 1：代码里调用 System.gc()

**错误示范** ❌：

```java
list.clear();
System.gc();   // "帮" JVM 清理一下
```

**原因**：`System.gc()` 触发的是**Full GC**，全线程停顿最长的一种。RMI 等老框架乱调它曾是经典性能事故来源。

**正确写法**：永远不要在业务代码里调用；必要时用 `-XX:+DisableExplicitGC` 直接禁用 ✅。

### 坑 2：把 -Xmx 设得越大越好

**错误认知** ❌：「内存越多越不容易 OOM，直接 -Xmx31g」。

**正确理解** ✅：堆越大，单次 GC 要扫描的对象越多，停顿越长；而且挤占了操作系统页缓存和线程栈的空间。经验值：堆占容器/机器内存的 50%~70%，Web 应用 4~8G 起步观察。

### 坑 3：长生命周期集合当缓存，老年代慢性中毒

**错误示范** ❌：

```java
private static final Map<Long, User> CACHE = new HashMap<>();  // 只进不出
```

**原因**：静态 Map 是 GC Root，塞进去的对象永远可达，逐渐晋升老年代，Full GC 频率越来越高，最终 OOM——这是生产内存泄漏第一大户。

**正确写法**：缓存必须有上限和过期策略，用 Caffeine ✅：

```java
Cache<Long, User> cache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofMinutes(10))
        .build();
```

## 小结

- ✅ 可达性分析判生死，GC Roots 出发走不到即垃圾
- ✅ 新生代复制、老年代整理；Young GC 正常、Full GC 报警
- ✅ G1 按 Region 回收，用 `MaxGCPauseMillis` 控制停顿预算
- ✅ 会读 `-Xlog:gc` 日志 + 生产参数模板直接抄

下一篇转向框架原理的地基：**《Java 反射与注解实战：手写一个迷你 @Autowired》**，从 0 实现依赖注入，为 Spring 篇铺路，敬请期待。

> 上一篇：《深入 JVM 内存结构：堆、栈、方法区图解 + 实验验证》
> 本系列完整目录见博客「技术博文」分类。
