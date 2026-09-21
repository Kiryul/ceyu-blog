---
title: Java 并发编程实战：synchronized 与 ReentrantLock 对比
date: 2026-08-05 10:00:00
categories: 技术博文
tags: [Java, 并发, synchronized, ReentrantLock]
---

这是「Java 从基础到实战」系列的第 8 篇。本文手写一个车站卖票 demo，先复现多线程下的「超卖」问题，再分别用 synchronized 和 ReentrantLock 修复，最后给出两者的选型结论。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

线程安全问题的可怕之处在于：单元测试跑一百遍都正常，上了生产偶发出错还无法复现。本文先让 Bug 稳定复现，你才能真正理解锁在保护什么。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `lock`。

## 步骤 1：复现问题 —— 100 张票被卖出 100 多次

新建 `UnsafeTicket.java`：

```java
package lock;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public class UnsafeTicket {
    private int stock = 100;                       // 票库存
    private final AtomicInteger sold = new AtomicInteger(); // 实际卖出计数（统计用）

    public void sell() {
        if (stock > 0) {          // ① 检查
            stock--;              // ② 扣减 —— ①② 不是原子操作！
            sold.incrementAndGet();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        UnsafeTicket ticket = new UnsafeTicket();
        CountDownLatch latch = new CountDownLatch(8);

        for (int i = 0; i < 8; i++) {              // 8 个窗口同时卖票
            new Thread(() -> {
                for (int j = 0; j < 50; j++) ticket.sell();
                latch.countDown();
            }, "窗口-" + i).start();
        }
        latch.await();
        System.out.println("剩余库存: " + ticket.stock);
        System.out.println("实际卖出: " + ticket.sold.get());
    }
}
```

多运行几次，典型输出：

```
剩余库存: -3
实际卖出: 103
```

100 张票卖出了 103 张，库存变成负数——这就是**超卖**。

**原因**：`if (stock > 0)` 和 `stock--` 之间存在时间窗，两个线程可能同时通过检查，再先后扣减。`stock--` 本身也不是原子的（读→减→写三步）。

## 步骤 2：方案一 —— synchronized 修复

把 `sell` 方法改为：

```java
public synchronized void sell() {      // 锁的是当前对象 this
    if (stock > 0) {
        stock--;
        sold.incrementAndGet();
    }
}
```

或者用同步块缩小锁范围（推荐，锁粒度更小）：

```java
private final Object lockObj = new Object();   // 专用锁对象

public void sell() {
    synchronized (lockObj) {
        if (stock > 0) {
            stock--;
            sold.incrementAndGet();
        }
    }
}
```

再运行，输出稳定为：

```
剩余库存: 0
实际卖出: 100
```

synchronized 的三个要点：

1. **同一把锁**才互斥：8 个线程必须竞争同一个对象的锁；
2. 修饰实例方法锁 `this`，修饰静态方法锁 `类.class`；
3. 可重入：同一线程可重复获取自己持有的锁，不会自己死锁自己。

## 步骤 3：方案二 —— ReentrantLock 修复

新建 `LockTicket.java`：

```java
package lock;

import java.util.concurrent.locks.ReentrantLock;

public class LockTicket {
    private int stock = 100;
    private final ReentrantLock lock = new ReentrantLock();

    public void sell() {
        lock.lock();          // 加锁
        try {
            if (stock > 0) {
                stock--;
            }
        } finally {
            lock.unlock();    // 必须在 finally 中解锁！
        }
    }
}
```

效果与 synchronized 相同，但它是一个「功能更多的手动挡」：

```java
// 1. 尝试加锁：拿不到就干别的，不傻等（synchronized 做不到）
if (lock.tryLock()) {
    try { /* 业务 */ } finally { lock.unlock(); }
} else {
    System.out.println("系统繁忙，请稍后再试");
}

// 2. 限时等锁：最多等 2 秒
if (lock.tryLock(2, TimeUnit.SECONDS)) { ... }

// 3. 可中断等锁：等待中可被 interrupt() 叫醒，避免死等
lock.lockInterruptibly();

// 4. 公平锁：先来先得（默认非公平，吞吐更高）
ReentrantLock fairLock = new ReentrantLock(true);
```

## 步骤 4：选型结论

| 对比项 | synchronized | ReentrantLock |
|--------|--------------|---------------|
| 加解锁 | 自动（JVM 管理） | 手动 lock/unlock |
| 尝试加锁 / 超时 | ❌ | ✅ tryLock |
| 可中断等待 | ❌ | ✅ lockInterruptibly |
| 公平锁 | ❌ | ✅ 可选 |
| 多条件队列 | 单一 wait/notify | ✅ 多个 Condition |
| 性能（JDK 6+） | 基本持平 | 基本持平 |

**选型原则：默认用 synchronized（简单、不会忘记解锁），只有需要 tryLock、超时、公平锁、多条件这些高级能力时才用 ReentrantLock。**

> 💡 补充：如果共享变量只是简单的计数/标志位，优先考虑无锁方案 `AtomicInteger`（CAS 实现）或 `volatile`（只保证可见性），比上锁更轻量。上面 demo 中的 `sold` 计数就是这么做的。

## 常见坑

### 坑 1：锁错了对象——每个线程一把锁，等于没锁

**错误示范** ❌：

```java
public void sell() {
    synchronized (new Object()) {   // 每次 new 一个新锁，毫无互斥效果
        if (stock > 0) stock--;
    }
}
```

**正确写法**：锁必须是所有线程**共享的同一个对象**，声明为 `private final` 字段 ✅。同理，用 String、Integer 等会被缓存/复用的对象做锁也是雷区。

### 坑 2：unlock 没放 finally，异常后锁永不释放

**错误示范** ❌：

```java
lock.lock();
doBusiness();     // 若此处抛异常……
lock.unlock();    // 永远执行不到，其他线程全部卡死
```

**正确写法**：`lock()` 之后紧跟 `try`，`unlock()` 永远放 `finally` ✅（见步骤 3）。

### 坑 3：死锁——两个线程互相等对方的锁

**错误示范** ❌：

```java
// 线程 A：先锁 lock1 再锁 lock2；线程 B：先锁 lock2 再锁 lock1 → 互相等待
new Thread(() -> { synchronized (lock1) { sleep(100); synchronized (lock2) {} } }).start();
new Thread(() -> { synchronized (lock2) { sleep(100); synchronized (lock1) {} } }).start();
```

**正确写法**：所有线程**按相同的顺序获取多把锁**（如统一先 lock1 后 lock2）✅。排查手段：IDEA 运行窗口点相机图标抓线程 dump，或命令行 `jstack <pid>`，会直接标出 `Found one Java-level deadlock`。

## 小结

- ✅ 线程安全问题根源：检查与修改之间的时间窗 + 非原子操作
- ✅ synchronized：自动挡，默认首选；锁对象必须共享且唯一
- ✅ ReentrantLock：手动挡，tryLock/超时/公平锁/多 Condition 时才上场，unlock 必须在 finally
- ✅ 简单计数用 AtomicInteger，比锁更轻

下一篇继续并发：**《JUC 并发工具箱：CountDownLatch、Semaphore、CompletableFuture 实战》**，用「并行调接口聚合结果」的真实场景串讲，敬请期待。

> 上一篇：《Java 多线程入门：Thread、Runnable、线程池一次讲清》
> 本系列完整目录见博客「技术博文」分类。
