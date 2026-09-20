---
title: Java 多线程入门：Thread、Runnable、线程池一次讲清
date: 2026-08-04 10:00:00
categories: 技术博文
tags: [Java, 多线程, 线程池, 并发]
---

这是「Java 从基础到实战」系列的第 7 篇，进入阶段二「进阶硬核」。本文从创建线程的两种方式讲起，重点拆解 ThreadPoolExecutor 的 7 个构造参数——每个参数都用代码实验演示效果，而不是背概念。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

面试必问「线程池 7 个参数」，但很多人背得出说不清。本文用一个可以调参观察的实验类，让你亲眼看到核心线程、队列、最大线程、拒绝策略是按什么顺序生效的。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `thread`。

## 步骤 1：创建线程的两种基本方式

新建 `CreateThreadDemo.java`：

```java
package thread;

public class CreateThreadDemo {
    public static void main(String[] args) {
        // 方式 1：继承 Thread（不推荐：Java 单继承，占了继承位）
        Thread t1 = new MyThread();
        t1.start();   // 注意是 start() 不是 run()！

        // 方式 2：实现 Runnable + Lambda（推荐：任务与线程解耦）
        Thread t2 = new Thread(() -> {
            System.out.println(Thread.currentThread().getName() + " 在执行任务");
        }, "worker-2");
        t2.start();

        System.out.println(Thread.currentThread().getName() + " 是主线程");
    }

    static class MyThread extends Thread {
        @Override
        public void run() {
            System.out.println(getName() + " 在执行任务");
        }
    }
}
```

预期输出（顺序可能不同——这正是并发的特点）：

```
main 是主线程
Thread-0 在执行任务
worker-2 在执行任务
```

> ⚠️ 调用 `run()` 只是普通方法调用，仍在当前线程执行；`start()` 才会启动新线程。这是新手第一坑。

## 步骤 2：为什么需要线程池

每次 `new Thread` 的问题：创建/销毁线程开销大（约 1ms 级 + 默认 1MB 栈内存）、数量不受控（来 1 万个请求就建 1 万个线程，直接把机器拖垮）。

线程池的思路：**预先养一批线程反复使用，任务多了排队，队也排满了再按策略处理**。

## 步骤 3：ThreadPoolExecutor 的 7 个参数

```java
public ThreadPoolExecutor(
    int corePoolSize,                  // 1. 核心线程数：常驻员工
    int maximumPoolSize,               // 2. 最大线程数：忙时可临时扩招的上限
    long keepAliveTime,                // 3. 临时工空闲多久被辞退
    TimeUnit unit,                     // 4. 上面时间的单位
    BlockingQueue<Runnable> workQueue, // 5. 任务队列：排队区
    ThreadFactory threadFactory,       // 6. 线程工厂：给线程起名
    RejectedExecutionHandler handler   // 7. 拒绝策略：队满且线程到顶时怎么办
)
```

**任务提交的真实顺序**（重点，面试常被追问）：

```
来任务 → 核心线程未满？建核心线程执行
       → 核心满了？进队列排队
       → 队列也满了？建临时线程（直到 maximumPoolSize）
       → 线程也到顶了？执行拒绝策略
```

注意：是**先排队，再扩容**，不是先扩容再排队。

## 步骤 4：用实验验证参数行为

新建 `PoolExperiment.java`，参数刻意调小方便观察：

```java
package thread;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class PoolExperiment {
    public static void main(String[] args) {
        AtomicInteger threadNo = new AtomicInteger(1);
        ThreadPoolExecutor pool = new ThreadPoolExecutor(
                2,                              // 核心线程 2
                4,                              // 最大线程 4
                30, TimeUnit.SECONDS,           // 临时线程空闲 30 秒回收
                new ArrayBlockingQueue<>(2),    // 队列容量 2
                r -> new Thread(r, "worker-" + threadNo.getAndIncrement()),
                new ThreadPoolExecutor.AbortPolicy()   // 默认拒绝策略：抛异常
        );

        // 连续提交 7 个耗时任务：2 核心 + 2 排队 + 2 临时 = 最多容纳 6 个
        for (int i = 1; i <= 7; i++) {
            final int taskId = i;
            try {
                pool.execute(() -> {
                    System.out.printf("任务%d 由 %s 执行%n",
                            taskId, Thread.currentThread().getName());
                    sleep(3000);
                });
                System.out.printf("任务%d 提交成功，当前线程数=%d，队列长度=%d%n",
                        taskId, pool.getPoolSize(), pool.getQueue().size());
            } catch (RejectedExecutionException e) {
                System.out.printf("任务%d 被拒绝！%n", taskId);
            }
        }
        pool.shutdown();
    }

    static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

预期输出（关键部分）：

```
任务1 提交成功，当前线程数=1，队列长度=0     ← 建核心线程 1
任务2 提交成功，当前线程数=2，队列长度=0     ← 建核心线程 2
任务3 提交成功，当前线程数=2，队列长度=1     ← 核心满，进队列
任务4 提交成功，当前线程数=2，队列长度=2     ← 继续排队，队列满
任务5 提交成功，当前线程数=3，队列长度=2     ← 队列满，扩临时线程 3
任务6 提交成功，当前线程数=4，队列长度=2     ← 扩临时线程 4，到达最大
任务7 被拒绝！                              ← 全满，触发 AbortPolicy
```

一次实验把「先排队再扩容、最后拒绝」的顺序看得清清楚楚。

四种内置拒绝策略速记：

| 策略 | 行为 | 适用 |
|------|------|------|
| `AbortPolicy`（默认） | 抛异常 | 关键业务，快速失败 |
| `CallerRunsPolicy` | 提交者自己执行，天然限流 | 不允许丢任务 |
| `DiscardPolicy` | 静默丢弃 | 可丢弃的任务（如日志） |
| `DiscardOldestPolicy` | 丢队头最老的任务 | 新数据比旧数据重要 |

## 步骤 5：获取任务结果 —— submit 与 Future

`execute` 没有返回值，需要结果时用 `submit` + `Callable`：

```java
package thread;

import java.util.concurrent.*;

public class FutureDemo {
    public static void main(String[] args) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);

        Future<Integer> future = pool.submit(() -> {
            Thread.sleep(1000);
            return 1 + 1;          // Callable 有返回值、可抛异常
        });

        System.out.println("主线程先干别的……");
        System.out.println("计算结果: " + future.get(2, TimeUnit.SECONDS)); // 最多等 2 秒
        pool.shutdown();
    }
}
```

> 💡 `future.get()` 会阻塞等待。更优雅的异步编排（多任务并行、结果聚合）留给第 9 篇的 CompletableFuture。

## 常见坑

### 坑 1：用 Executors 快捷工厂创建线程池

**错误示范** ❌：

```java
ExecutorService pool = Executors.newFixedThreadPool(10);   // 队列无界！
ExecutorService pool2 = Executors.newCachedThreadPool();   // 最大线程数无界！
```

**原因**：`newFixedThreadPool` 的队列是无界 `LinkedBlockingQueue`，任务堆积直接 OOM；`newCachedThreadPool` 最大线程数是 `Integer.MAX_VALUE`，线程爆炸。《阿里巴巴 Java 开发手册》强制禁止。

**正确写法**：手动 `new ThreadPoolExecutor`，显式指定有界队列和拒绝策略 ✅（见步骤 4）。

### 坑 2：线程池不 shutdown，程序退不出去

**现象**：main 方法跑完了，进程还挂着。**原因**：池内是非守护线程，JVM 等它们结束。

**正确写法**：不再提交任务时调用 `pool.shutdown()`（温和，等已提交任务跑完）；需要立刻停用 `shutdownNow()` ✅。

### 坑 3：任务里的异常被静默吞掉

**错误示范** ❌：

```java
pool.submit(() -> { throw new RuntimeException("出错了"); });
// 控制台毫无动静！异常被存进 Future，没人 get 就没人知道
```

**正确写法**：`submit` 的任务必须 `future.get()` 检查；或改用 `execute`（异常会打到控制台）；或任务内部自行 try-catch 记日志 ✅。

## 小结

- ✅ 创建线程用 Runnable + Lambda，`start()` 而非 `run()`
- ✅ 7 参数核心顺序：**核心线程 → 队列 → 临时线程 → 拒绝策略**
- ✅ 禁用 Executors 快捷工厂，手动创建并指定有界队列
- ✅ `submit` + `Future` 拿结果，记得处理任务内异常

下一篇聚焦线程安全：**《Java 并发编程实战：synchronized 与 ReentrantLock 对比》**，手写卖票 demo 复现超卖问题再逐步修复，敬请期待。

> 上一篇：《Java IO 与 NIO 入门：文件读写的 5 种方式及性能对比》
> 本系列完整目录见博客「技术博文」分类。
