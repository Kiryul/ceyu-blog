---
title: JUC 并发工具箱：CountDownLatch、Semaphore、CompletableFuture 实战
date: 2026-08-06 10:00:00
categories: 技术博文
tags: [Java, JUC, CompletableFuture, 并发]
---

这是「Java 从基础到实战」系列的第 9 篇。java.util.concurrent（JUC）包里的工具类能解决 90% 的并发协作问题。本文用「商品详情页并行调用三个接口聚合结果」这个真实场景为主线，串讲 CountDownLatch、Semaphore 和 CompletableFuture。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

真实需求：商品详情页需要展示「基本信息 + 价格 + 库存」，三个数据来自三个远程接口，每个耗时约 1 秒。串行调用要 3 秒，用户等不起——本文的目标是把它压到 1 秒。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `juc`，先建一个模拟远程接口的工具类 `FakeApi.java`：

```java
package juc;

public class FakeApi {
    /** 模拟远程调用：耗时约 1 秒 */
    public static String call(String name) {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return name + "数据";
    }
}
```

## 步骤 1：CountDownLatch —— 等所有子任务完成再汇总

思路：门闩计数 3，每个接口调完减 1，主线程 `await()` 等计数归零。新建 `LatchDemo.java`：

```java
package juc;

import java.util.Map;
import java.util.concurrent.*;

public class LatchDemo {
    public static void main(String[] args) throws InterruptedException {
        long start = System.currentTimeMillis();
        ExecutorService pool = Executors.newFixedThreadPool(3);
        CountDownLatch latch = new CountDownLatch(3);          // 计数 = 任务数
        Map<String, String> result = new ConcurrentHashMap<>(); // 并发安全的 Map

        for (String api : new String[]{"基本信息", "价格", "库存"}) {
            pool.execute(() -> {
                try {
                    result.put(api, FakeApi.call(api));
                } finally {
                    latch.countDown();                         // 必须放 finally
                }
            });
        }

        latch.await(3, TimeUnit.SECONDS);   // 带超时的等待，防止无限阻塞
        System.out.println("聚合结果: " + result);
        System.out.println("总耗时: " + (System.currentTimeMillis() - start) + " ms");
        pool.shutdown();
    }
}
```

预期输出：

```
聚合结果: {库存=库存数据, 价格=价格数据, 基本信息=基本信息数据}
总耗时: 1024 ms
```

3 秒的活 1 秒干完。注意两个细节：`countDown()` 放 finally 防止异常导致主线程永远等待；`await` 带超时兜底。

## 步骤 2：Semaphore —— 限制并发数

场景变化：下游接口有限流，最多允许 2 个并发。信号量就是「停车场道闸」：新建 `SemaphoreDemo.java`：

```java
package juc;

import java.util.concurrent.*;

public class SemaphoreDemo {
    public static void main(String[] args) {
        ExecutorService pool = Executors.newFixedThreadPool(6);
        Semaphore permits = new Semaphore(2);   // 只有 2 个许可证

        for (int i = 1; i <= 6; i++) {
            final int id = i;
            pool.execute(() -> {
                try {
                    permits.acquire();          // 拿许可证，拿不到就排队
                    System.out.printf("[%tT] 请求%d 开始调用%n",
                            System.currentTimeMillis(), id);
                    FakeApi.call("接口");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    permits.release();          // 还许可证，必须放 finally
                }
            });
        }
        pool.shutdown();
    }
}
```

预期输出（每秒只放行 2 个，共 3 批）：

```
[21:00:01] 请求1 开始调用
[21:00:01] 请求2 开始调用
[21:00:02] 请求3 开始调用
[21:00:02] 请求4 开始调用
[21:00:03] 请求5 开始调用
[21:00:03] 请求6 开始调用
```

## 步骤 3：CompletableFuture —— 现代异步编排（重点）

CountDownLatch 能等，但拿结果、串任务都要自己动手。JDK 8 的 CompletableFuture 把「并行 + 聚合 + 链式加工」一步到位。新建 `CfDemo.java`：

```java
package juc;

import java.util.concurrent.*;

public class CfDemo {
    public static void main(String[] args) {
        long start = System.currentTimeMillis();
        // 生产环境务必传入自定义线程池（默认共用 ForkJoinPool 有风险）
        ExecutorService pool = Executors.newFixedThreadPool(3);

        CompletableFuture<String> info  = CompletableFuture.supplyAsync(
                () -> FakeApi.call("基本信息"), pool);
        CompletableFuture<String> price = CompletableFuture.supplyAsync(
                () -> FakeApi.call("价格"), pool);
        CompletableFuture<String> stock = CompletableFuture.supplyAsync(
                () -> FakeApi.call("库存"), pool);

        // 三个都完成后聚合，join() 此时不会阻塞
        String page = CompletableFuture.allOf(info, price, stock)
                .thenApply(v -> String.join(" | ",
                        info.join(), price.join(), stock.join()))
                .join();

        System.out.println("详情页: " + page);
        System.out.println("总耗时: " + (System.currentTimeMillis() - start) + " ms");
        pool.shutdown();
    }
}
```

预期输出：

```
详情页: 基本信息数据 | 价格数据 | 库存数据
总耗时: 1018 ms
```

常用编排 API 速查：

```java
// 串行加工：上一步结果 → 下一步输入
cf.thenApply(s -> s + "已加工")          // 转换结果
  .thenAccept(System.out::println);      // 消费结果，无返回

// 两个任务都完成后合并
cfA.thenCombine(cfB, (a, b) -> a + b);

// 任意一个先完成就用谁（两个数据源取快的）
cfA.applyToEither(cfB, r -> r);

// 异常兜底：任何一步出错都会走到这里
cf.exceptionally(ex -> "默认值");

// 超时控制（JDK 9+）：2 秒没结果就返回默认值
cf.completeOnTimeout("超时默认值", 2, TimeUnit.SECONDS);
```

## 常见坑

### 坑 1：supplyAsync 不传线程池

**错误示范** ❌：

```java
CompletableFuture.supplyAsync(() -> FakeApi.call("接口"));   // 用的是全局 ForkJoinPool
```

**原因**：默认共用 `ForkJoinPool.commonPool()`，线程数 = CPU 核数 - 1。IO 型任务（远程调用）会把它占满，同进程里所有用它的组件（包括并行流）一起被拖慢。

**正确写法**：始终传入自己创建的线程池 ✅（见步骤 3）。

### 坑 2：异常被静默吞掉

**错误示范** ❌：

```java
CompletableFuture.supplyAsync(() -> { throw new RuntimeException("挂了"); }, pool)
        .thenApply(s -> s + "加工");
// 程序正常结束，控制台没有任何异常信息！
```

**原因**：异常存放在 future 内部，只有调用 `join()/get()` 时才会抛出。

**正确写法**：链条末尾必须有 `join()`、`exceptionally` 或 `whenComplete` 之一处理异常 ✅：

```java
cf.whenComplete((r, ex) -> { if (ex != null) System.err.println("任务失败: " + ex); });
```

### 坑 3：get() 不带超时，线上被无限阻塞

**错误示范** ❌：`cf.get()` —— 依赖的下游接口挂了，你的线程就永远卡在这。

**正确写法**：一律 `cf.get(3, TimeUnit.SECONDS)` 或 `completeOnTimeout` 给兜底值 ✅。

## 小结

| 工具 | 一句话定位 |
|------|-----------|
| CountDownLatch | 等 N 个任务全部完成（一次性） |
| Semaphore | 控制同时干活的线程数（限流） |
| CompletableFuture | 并行 + 聚合 + 链式加工 + 异常兜底，异步编排首选 |

- ✅ 并行聚合场景直接上 CompletableFuture + 自定义线程池
- ✅ `countDown()`/`release()` 永远放 finally；等待永远带超时

下一篇深入 JVM：**《深入 JVM 内存结构：堆、栈、方法区图解 + 实验验证》**，用代码把每个内存区域「撑爆」给你看，敬请期待。

> 上一篇：《Java 并发编程实战：synchronized 与 ReentrantLock 对比》
> 本系列完整目录见博客「技术博文」分类。
