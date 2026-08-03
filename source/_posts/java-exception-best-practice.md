---
title: Java 异常处理最佳实践：try-with-resources 与自定义异常
date: 2026-08-01 10:00:00
categories: 技术博文
tags: [Java, 异常处理, try-with-resources]
---

这是「Java 从基础到实战」系列的第 4 篇。异常处理写得好不好，直接决定线上问题排查是 5 分钟还是 5 小时。本文用「错误写法 → 正确写法」的对照重构方式，讲清异常分类、try-with-resources 和自定义业务异常，所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

很多人写异常处理只有一招：`try { ... } catch (Exception e) { e.printStackTrace(); }`。这种写法会吞掉关键信息、掩盖真正的错误。本文通过重构一段「读取配置文件」的烂代码，一步步演进到生产级写法。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `exception`，本文所有类放在这个包下。

## 步骤 1：三分钟搞懂异常体系

```
Throwable
├── Error                 // JVM 级错误（OOM 等），程序无法处理，不要捕获
└── Exception
    ├── 受检异常（checked）    // IOException、SQLException：编译器强制处理
    └── RuntimeException      // NPE、越界、参数非法：编译器不强制处理
```

一句话选型：**调用方有能力恢复的用受检异常；属于编程错误或业务校验失败的用运行时异常**。实际工程中，业务异常几乎都继承 `RuntimeException`（后面步骤 4 会实现）。

## 步骤 2：重构第一轮 —— 别再手动 close 资源

需求：读取文件第一行内容。先看典型的**错误示范** ❌：

```java
package exception;

import java.io.BufferedReader;
import java.io.FileReader;

public class ReadFileBad {
    public static String readFirstLine(String path) {
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new FileReader(path));
            return reader.readLine();
        } catch (Exception e) {
            e.printStackTrace();   // 只打印，调用方毫不知情
            return null;           // 用 null 掩盖失败
        } finally {
            try {
                if (reader != null) reader.close();   // close 本身还要 try
            } catch (Exception ignored) {}
        }
    }
}
```

问题：手动 close 啰嗦且容易漏、`catch (Exception)` 一把抓、返回 null 把问题传染给调用方。

**正确写法**：JDK 7+ 的 try-with-resources ✅。新建 `ReadFileGood.java`：

```java
package exception;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class ReadFileGood {
    public static String readFirstLine(String path) throws IOException {
        // 括号里声明的资源，无论是否异常都会自动 close（逆序关闭）
        try (BufferedReader reader = Files.newBufferedReader(Path.of(path))) {
            return reader.readLine();
        }
    }

    public static void main(String[] args) throws IOException {
        // 先在项目根目录建一个 config.txt，写入一行：app.name=demo
        System.out.println(readFirstLine("config.txt"));
    }
}
```

预期输出：

```
app.name=demo
```

只要类实现了 `AutoCloseable` 接口（IO 流、JDBC 连接、Lock 等都实现了），就能放进 try 括号自动关闭。**从今天起，所有资源操作一律 try-with-resources。**

## 步骤 3：重构第二轮 —— 捕获的三条纪律

```java
// 纪律 1：按需捕获具体异常，不要 catch (Exception) 一把抓
try (var reader = Files.newBufferedReader(Path.of("config.txt"))) {
    return reader.readLine();
} catch (NoSuchFileException e) {
    // 能处理的才捕获：文件不存在时用默认配置，这是「恢复」
    return "app.name=default";
}

// 纪律 2：处理不了就别捕获，声明 throws 交给上层
public static String load(String path) throws IOException { ... }

// 纪律 3：转译异常时必须保留原始异常（cause），否则堆栈断链
throw new ConfigException("加载配置失败: " + path, e);   // e 作为 cause 传入
```

> ⚠️ 最恶劣的写法是 `catch (Exception e) {}` 空 catch——异常被静默吞掉，线上出问题连日志都没有。IDEA 中它会被灰色高亮警告，看到就消灭。

## 步骤 4：自定义业务异常 —— 实战标配

真实需求：用户服务中，「用户不存在」「余额不足」这类业务失败需要携带错误码返回给前端。新建 `BizException.java`：

```java
package exception;

/**
 * 业务异常：继承 RuntimeException，避免调用链每层都写 throws
 */
public class BizException extends RuntimeException {
    private final int code;

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public BizException(int code, String message, Throwable cause) {
        super(message, cause);   // 保留原始异常，堆栈不断链
        this.code = code;
    }

    public int getCode() { return code; }
}
```

新建 `UserService.java` 模拟使用：

```java
package exception;

import java.util.Map;

public class UserService {
    private static final Map<Long, String> DB = Map.of(1L, "张三");

    public String getUser(long id) {
        String name = DB.get(id);
        if (name == null) {
            throw new BizException(40401, "用户不存在, id=" + id);
        }
        return name;
    }

    public static void main(String[] args) {
        UserService service = new UserService();
        System.out.println(service.getUser(1L));   // 张三

        try {
            service.getUser(999L);
        } catch (BizException e) {
            // 模拟全局异常处理器：转成错误码 + 提示返回前端
            System.out.println("code=" + e.getCode() + ", msg=" + e.getMessage());
        }
    }
}
```

预期输出：

```
张三
code=40401, msg=用户不存在, id=999
```

这套「BizException + 错误码」模式会在 Spring Boot 篇升级为 `@RestControllerAdvice` 全局异常处理，模型完全一样。

## 常见坑

### 坑 1：finally 中 return，吞掉异常

**错误示范** ❌：

```java
try {
    return Integer.parseInt("abc");   // 抛 NumberFormatException
} finally {
    return -1;   // finally 的 return 会覆盖一切——异常凭空消失！
}
```

**正确写法**：finally 只做清理，永远不要写 return ✅。

### 坑 2：先打日志再抛出，导致一个错误打两遍日志

**错误示范** ❌：

```java
catch (IOException e) {
    log.error("读取失败", e);   // 这里打一遍
    throw new BizException(500, "读取失败", e);   // 上层全局处理器又打一遍
}
```

**正确写法**：**要么记录、要么抛出，二选一**。抛出的异常最终由全局处理器统一记录 ✅。

### 坑 3：用异常控制正常业务流程

**错误示范** ❌：

```java
try {
    return Integer.parseInt(input) > 0;
} catch (NumberFormatException e) {
    return false;   // 拿异常当 if 用
}
```

**原因**：异常构造时要抓取整个调用堆栈，比普通判断慢百倍以上，且语义混乱。

**正确写法**：能预判的条件用判断处理 ✅：

```java
return input != null && input.matches("\\d+") && Integer.parseInt(input) > 0;
```

## 小结

- ✅ 受检异常 vs 运行时异常：业务异常选 `RuntimeException`
- ✅ 资源关闭一律 try-with-resources
- ✅ 捕获三纪律：按需捕获、处理不了就 throws、转译保留 cause
- ✅ 手写 `BizException` + 错误码，为 Spring Boot 全局异常处理打底

下一篇回到日常编码效率：**《Java 8 Stream 流式编程实战：告别 for 循环的 20 个例子》**，全是可直接复制的片段，敬请期待。

> 上一篇：《一文吃透 Java 泛型：从 List&lt;T&gt; 到通配符 ? extends》
> 本系列完整目录见博客「技术博文」分类。
