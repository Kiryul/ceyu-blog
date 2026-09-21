---
title: Java 网络编程：从 Socket 到手写一个简易 HTTP 服务器
date: 2026-08-10 10:00:00
categories: 技术博文
tags: [Java, Socket, 网络编程, HTTP]
---

这是「Java 从基础到实战」系列的第 13 篇。Tomcat、Netty 再复杂，最底层也是 Socket。本文先用 30 行代码跑通 TCP 通信，再升级成一个能被浏览器直接访问的多线程 HTTP 服务器——全部代码不到 200 行，没有任何依赖。JDK 17 下可直接运行。

<!-- more -->

## 前言

「浏览器输入 URL 后发生了什么」是面试经典题，但纸上谈兵不如亲手接一次浏览器的请求：你会亲眼看到浏览器发来的原始报文，也就真正理解了 HTTP 只是「按格式约定的字符串」。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |
| 浏览器 | 任意（Chrome/Edge） |

在 `java-basics` 项目中新建包 `net`。

## 步骤 1：最小 TCP 通信 —— Echo 服务器

Socket 通信模型：服务端 `ServerSocket.accept()` 等电话，客户端 `new Socket(host, port)` 打电话，接通后双方各有一对输入/输出流对讲。

新建 `EchoServer.java`：

```java
package net;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class EchoServer {
    public static void main(String[] args) throws IOException {
        try (ServerSocket server = new ServerSocket(9000)) {
            System.out.println("Echo 服务器启动，监听 9000 端口……");
            while (true) {
                Socket socket = server.accept();   // 阻塞，直到有客户端连上
                try (socket;
                     var reader = new BufferedReader(new InputStreamReader(
                             socket.getInputStream(), StandardCharsets.UTF_8));
                     var writer = new PrintWriter(new OutputStreamWriter(
                             socket.getOutputStream(), StandardCharsets.UTF_8), true)) {
                    String line = reader.readLine();
                    System.out.println("收到: " + line);
                    writer.println("Echo: " + line);   // 原样回传
                }
            }
        }
    }
}
```

新建 `EchoClient.java`，先运行服务器再运行它：

```java
package net;

import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class EchoClient {
    public static void main(String[] args) throws IOException {
        try (Socket socket = new Socket("127.0.0.1", 9000);
             var writer = new PrintWriter(new OutputStreamWriter(
                     socket.getOutputStream(), StandardCharsets.UTF_8), true);
             var reader = new BufferedReader(new InputStreamReader(
                     socket.getInputStream(), StandardCharsets.UTF_8))) {
            writer.println("你好，Socket！");
            System.out.println("服务器回复: " + reader.readLine());
        }
    }
}
```

客户端预期输出：

```
服务器回复: Echo: 你好，Socket！
```

TCP 通信就这么多东西：**建连接、读写流、关连接**。

## 步骤 2：偷看浏览器发来的 HTTP 请求

把 Echo 服务器的读取部分改成循环打印，然后用**浏览器**访问 `http://localhost:9000/hello`：

```java
String line;
while ((line = reader.readLine()) != null && !line.isEmpty()) {
    System.out.println(line);
}
```

控制台会打印出浏览器的原始请求报文：

```
GET /hello HTTP/1.1
Host: localhost:9000
Connection: keep-alive
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
Accept: text/html,application/xhtml+xml,...
```

看清楚了：**HTTP 请求 = 请求行 + 头部字段 + 空行 + 可选 body 的纯文本**。所谓 HTTP 服务器，就是解析这段文本、按格式回一段文本。

## 步骤 3：手写 HTTP 服务器（核心 130 行）

功能目标：支持 GET 路由分发、返回 HTML/JSON、404 兜底、多线程处理并发。新建 `MiniHttpServer.java`：

```java
package net;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;

public class MiniHttpServer {
    /** 路由表：路径 -> 处理函数（入参是路径，返回 body 字符串） */
    private static final Map<String, Function<String, String>> ROUTES = Map.of(
            "/", path -> "<h1>欢迎来到迷你服务器</h1><p>试试 <a href='/time'>/time</a></p>",
            "/time", path -> "<h1>当前时间: " + java.time.LocalTime.now() + "</h1>",
            "/api/user", path -> "{\"id\": 1, \"name\": \"张三\"}"
    );

    public static void main(String[] args) throws IOException {
        ExecutorService pool = Executors.newFixedThreadPool(10);   // 并发处理
        try (ServerSocket server = new ServerSocket(8080)) {
            System.out.println("HTTP 服务器启动: http://localhost:8080");
            while (true) {
                Socket socket = server.accept();
                pool.execute(() -> handle(socket));   // 每个连接丢给线程池
            }
        }
    }

    private static void handle(Socket socket) {
        try (socket;
             var reader = new BufferedReader(new InputStreamReader(
                     socket.getInputStream(), StandardCharsets.UTF_8));
             var out = new BufferedOutputStream(socket.getOutputStream())) {

            // 1. 解析请求行：GET /time HTTP/1.1
            String requestLine = reader.readLine();
            if (requestLine == null) return;
            String[] parts = requestLine.split(" ");
            String method = parts[0];
            String path = parts[1];
            System.out.printf("[%s] %s %s%n", Thread.currentThread().getName(), method, path);

            // 2. 跳过（丢弃）请求头，读到空行为止
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {}

            // 3. 路由分发
            Function<String, String> handler = ROUTES.get(path);
            if (handler != null) {
                String body = handler.apply(path);
                String type = path.startsWith("/api")
                        ? "application/json" : "text/html";
                write(out, 200, "OK", type, body);
            } else {
                write(out, 404, "Not Found", "text/html", "<h1>404 页面不存在</h1>");
            }
        } catch (IOException e) {
            System.err.println("处理请求出错: " + e.getMessage());
        }
    }

    /** 按 HTTP 格式写响应：状态行 + 头 + 空行 + body */
    private static void write(OutputStream out, int code, String reason,
                              String contentType, String body) throws IOException {
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        String headers = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: " + contentType + "; charset=utf-8\r\n"
                + "Content-Length: " + bodyBytes.length + "\r\n"
                + "Connection: close\r\n"
                + "\r\n";                              // 头和 body 之间的空行，不能少！
        out.write(headers.getBytes(StandardCharsets.UTF_8));
        out.write(bodyBytes);
        out.flush();
    }
}
```

## 步骤 4：验证

运行 `MiniHttpServer`，依次用浏览器访问：

| URL | 预期效果 |
|-----|----------|
| `http://localhost:8080/` | 显示欢迎页，带链接 |
| `http://localhost:8080/time` | 显示当前时间，刷新会变 |
| `http://localhost:8080/api/user` | 显示 JSON：`{"id": 1, "name": "张三"}` |
| `http://localhost:8080/xxx` | 显示 404 页面不存在 |

控制台同时打印每个请求由哪个线程处理：

```
[pool-1-thread-1] GET / 
[pool-1-thread-2] GET /time
[pool-1-thread-3] GET /api/user
```

恭喜，你写的服务器已经具备了 Web 框架的雏形：**监听 → 解析 → 路由 → 响应 → 并发**。Spring Boot 内嵌的 Tomcat 做的是同一件事，只是解析更完整、线程模型更精巧。

## 常见坑

### 坑 1：响应缺少空行或 Content-Length，浏览器一直转圈

**错误示范** ❌：头部和 body 之间漏掉 `\r\n` 空行，或不写 `Content-Length`——浏览器不知道 body 从哪开始、到哪结束，一直等待。

**正确写法**：严格按「状态行 → 头部 → **空行** → body」格式输出，`Content-Length` 用**字节数**（`bodyBytes.length`），不是字符串长度 ✅（中文字符 UTF-8 下占 3 字节，用 `body.length()` 必错）。

### 坑 2：端口被占用 `BindException: Address already in use`

**原因**：上一个进程还占着 8080（常见于上次运行没停掉）。

**解法**：IDEA 中先点红色方块停掉旧进程；查不到就用命令行 ✅：

```powershell
netstat -ano | findstr :8080     # 找到占用的 PID
taskkill /F /PID <PID>
```

### 坑 3：单线程 accept 循环里直接处理请求

**错误示范** ❌：不用线程池，`handle(socket)` 直接在主循环调用——一个慢请求会卡住所有后续连接（用两个浏览器标签同时访问 `/time` 即可复现排队现象）。

**正确写法**：accept 后立刻把 socket 丢给线程池 ✅（见步骤 3），这正是第 7 篇线程池知识的实战应用。

## 小结

- ✅ TCP 通信三件事：建连接、读写流、关连接
- ✅ HTTP 报文 = 按约定格式的纯文本，空行是头与体的分界
- ✅ 手写 HTTP 服务器五要素：监听 → 解析 → 路由 → 响应 → 线程池并发
- ✅ Content-Length 按字节算，端口冲突用 netstat 排查

下一篇是阶段二收官：**《JDK 17/21 新特性实战：Record、密封类、虚拟线程》**，虚拟线程 vs 线程池压测对比，敬请期待。

> 上一篇：《Java 反射与注解实战：手写一个迷你 @Autowired》
> 本系列完整目录见博客「技术博文」分类。
