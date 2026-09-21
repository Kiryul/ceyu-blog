---
title: 深入 JVM 内存结构：堆、栈、方法区图解 + 实验验证
date: 2026-08-07 10:00:00
categories: 技术博文
tags: [Java, JVM, 内存模型, OOM]
---

这是「Java 从基础到实战」系列的第 10 篇。JVM 内存结构不该靠背图记忆——本文用代码把每个区域「撑爆」，让 OutOfMemoryError 和 StackOverflowError 亲自告诉你各区域存的是什么。所有实验在 JDK 17 下可复现。

<!-- more -->

## 前言

面试画内存结构图人人都会，但「堆和栈到底差在哪」「元空间放什么」这类追问就能筛掉一半人。做完本文 4 个实验，这些问题你会有肌肉记忆。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `jvm`。实验需要设置 JVM 参数：IDEA 中点运行配置下拉框 → `Edit Configurations...` → 在 `VM options`（若没有该输入框，点 `Modify options → Add VM options`）中填写参数。

## 步骤 1：先看全景图

JDK 8+ 的运行时数据区：

```
┌─────────────────────────── JVM 内存 ───────────────────────────┐
│  线程共享区                                                     │
│  ┌───────────────────────┐  ┌────────────────────────────┐    │
│  │ 堆 Heap                │  │ 元空间 Metaspace（本地内存） │    │
│  │ 对象实例、数组          │  │ 类的元数据（类结构、方法字节码）│   │
│  │ = GC 的主战场          │  │ + 运行时常量池               │    │
│  └───────────────────────┘  └────────────────────────────┘    │
│  线程私有区（每个线程一份）                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐      │
│  │ 虚拟机栈       │ │ 本地方法栈    │ │ 程序计数器          │      │
│  │ 方法调用的栈帧  │ │ native 方法  │ │ 当前执行到哪行字节码 │      │
│  └──────────────┘ └──────────────┘ └───────────────────┘      │
└────────────────────────────────────────────────────────────────┘
```

一句话分工：**对象在堆，方法调用在栈，类信息在元空间**。`new Student()` 的对象本体在堆里，局部变量 `student` 只是栈上一个指向它的引用。

## 步骤 2：实验一 —— 撑爆堆（Heap OOM）

新建 `HeapOom.java`，VM options 填 `-Xmx20m -Xms20m`（堆上限 20MB）：

```java
package jvm;

import java.util.ArrayList;
import java.util.List;

public class HeapOom {
    public static void main(String[] args) {
        List<byte[]> list = new ArrayList<>();
        int count = 0;
        while (true) {
            list.add(new byte[1024 * 1024]);   // 每次塞 1MB，且被 list 引用着无法回收
            System.out.println("已分配 " + (++count) + " MB");
        }
    }
}
```

预期输出：

```
已分配 1 MB
...
已分配 17 MB
Exception in thread "main" java.lang.OutOfMemoryError: Java heap space
```

**结论**：被引用的对象无法回收，堆满即 `Java heap space`。生产上这类问题多为集合只加不删、缓存无上限。

## 步骤 3：实验二 —— 撑爆栈（StackOverflowError）

新建 `StackSof.java`，VM options 填 `-Xss256k`（每线程栈缩小到 256KB，更快复现）：

```java
package jvm;

public class StackSof {
    private static int depth = 0;

    public static void recur() {
        depth++;
        recur();   // 无限递归：每次调用压入一个新栈帧，直到栈放不下
    }

    public static void main(String[] args) {
        try {
            recur();
        } catch (StackOverflowError e) {
            System.out.println("栈溢出！递归深度: " + depth);
        }
    }
}
```

预期输出（深度随栈大小变化）：

```
栈溢出！递归深度: 1804
```

**结论**：每次方法调用都在栈上压入一个栈帧（存局部变量、返回地址），递归没有出口就会 `StackOverflowError`。它和堆 OOM 是两个世界的错误。

## 步骤 4：实验三 —— 撑爆元空间（Metaspace OOM）

元空间存类的元数据，动态生成海量类就能撑爆它。用 JDK 自带的动态代理即可，无需第三方库。新建 `MetaspaceOom.java`，VM options 填 `-XX:MaxMetaspaceSize=32m`：

```java
package jvm;

import java.lang.reflect.Proxy;

public class MetaspaceOom {
    interface Task { void run(); }

    public static void main(String[] args) {
        int count = 0;
        try {
            while (true) {
                // 每次循环生成一个新的代理类（注意：故意不复用）
                Proxy.newProxyInstance(
                        new ClassLoaderLeak(),               // 新类加载器，阻止类被复用
                        new Class[]{Task.class},
                        (proxy, method, a) -> null);
                count++;
            }
        } catch (OutOfMemoryError e) {
            System.out.println("元空间溢出！已生成类: " + count + "，错误: " + e.getMessage());
        }
    }

    static class ClassLoaderLeak extends ClassLoader {}
}
```

预期输出：

```
元空间溢出！已生成类: 26801，错误: Metaspace
```

**结论**：错误信息里的 `Metaspace` 直接指明区域。生产上常见诱因：CGLIB/反射滥用导致动态类无限生成。

## 步骤 5：实验四 —— 观察对象从栈引用到堆分配

不撑爆了，用 JVM 参数直观看看堆内部的分代。VM options 填 `-Xmx20m -Xlog:gc+heap=info`，随便跑一个前面的类，日志会输出：

```
[0.003s][info][gc,heap] Heap Region Size: 1M
[0.014s][info][gc,heap] Minimum heap 20971520  Initial heap 20971520  Maximum heap 20971520
```

再加 `-Xlog:gc` 跑 HeapOom，能看到 OOM 前的多次 GC 挣扎：

```
[0.279s][info][gc] GC(3) Pause Young (Normal) (G1 Evacuation Pause) 9M->8M(20M) 1.263ms
[0.301s][info][gc] GC(5) Pause Full (G1 Compaction Pause) 17M->17M(20M) 5.921ms
```

`17M->17M` 意味着 Full GC 后一点都没回收出来——全是活对象，OOM 已成定局。这个日志阅读技巧下一篇 GC 专题会展开。

## 常见坑

### 坑 1：把 OutOfMemoryError 和 StackOverflowError 混为一谈

**错误认知** ❌：「内存不够就是 OOM」。

**正确理解** ✅：堆满了是 `OutOfMemoryError: Java heap space`（对象太多）；栈满了是 `StackOverflowError`（调用太深）；元空间满是 `OutOfMemoryError: Metaspace`（类太多）。看错误信息第一行就能定位区域。

### 坑 2：以为局部变量的对象「分配在栈上」

**错误认知** ❌：「局部变量在栈上，所以 `new` 出来的对象也在栈上」。

**正确理解** ✅：栈上只有**引用**（一个指针），对象本体永远在堆。方法结束时引用随栈帧销毁，堆中对象要等 GC 判定无人引用后才回收。

### 坑 3：catch OutOfMemoryError 继续跑

**错误示范** ❌：

```java
try { ... } catch (OutOfMemoryError e) { log.warn("内存不够，忽略"); }
```

**原因**：OOM 发生时堆已经病入膏肓，捕获后程序状态不可信，继续运行只会产生更诡异的错误。

**正确写法**：让它崩，配合启动参数留现场，事后分析 ✅：

```
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump
```

dump 文件用 IDEA 自带的 Profiler（`Open Profiler Snapshot`）或 Eclipse MAT 打开，按对象占用排序即可锁定元凶。

## 小结

- ✅ 三大区域分工：对象在堆、方法调用在栈、类元数据在元空间
- ✅ 三种错误对号入座：`heap space` / `StackOverflowError` / `Metaspace`
- ✅ 实验参数速记：`-Xmx` 堆上限、`-Xss` 线程栈、`-XX:MaxMetaspaceSize` 元空间
- ✅ 生产必配：`-XX:+HeapDumpOnOutOfMemoryError` 留现场

下一篇顺着 GC 日志往下挖：**《JVM 垃圾回收入门：GC 算法、G1 收集器与调优参数实操》**，敬请期待。

> 上一篇：《JUC 并发工具箱：CountDownLatch、Semaphore、CompletableFuture 实战》
> 本系列完整目录见博客「技术博文」分类。
