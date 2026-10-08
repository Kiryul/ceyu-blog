---
title: Spring Boot 3 快速上手：15 分钟写出第一个 REST API
date: 2026-08-13 10:00:00
categories: 技术博文
tags: [Java, Spring Boot, REST API]
---

这是「Java 从基础到实战」系列的第 16 篇。前 15 篇打的地基（反射注入、HTTP 服务器、Maven）今天全部兑现：用 Spring Boot 3 从零创建项目，写出一组完整的用户增删改查 REST API，并用 IDEA 自带的 HTTP Client 测试。全程 15 分钟。

<!-- more -->

## 前言

还记得第 12 篇手写的迷你 IoC 容器和第 13 篇手写的 HTTP 服务器吗？Spring Boot = 工业级 IoC 容器 + 内嵌 Tomcat + 自动配置。你已经懂它的原理，今天只是换一套成熟的工具。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Spring Boot 3 最低要求） |
| IntelliJ IDEA | Community 社区版 |
| Spring Boot | 3.3.x |

## 步骤 1：用 start.spring.io 生成项目

社区版 IDEA 没有内置 Spring 项目向导，用官方脚手架网站（更通用）：

1. 打开 <https://start.spring.io>；
2. 按下表选择：

| 选项 | 值 |
|------|-----|
| Project | Maven |
| Language | Java |
| Spring Boot | 3.3.x（最新稳定版） |
| Group | com.ceyu |
| Artifact | user-api |
| Packaging | Jar |
| Java | 17 |

3. 右侧 `ADD DEPENDENCIES` 添加两个依赖：**Spring Web**、**Lombok**；
4. 点 `GENERATE` 下载 zip，解压到 `D:\java-learn\user-api`；
5. IDEA 中 `File → Open` 选择该目录，等待 Maven 下载依赖（已配阿里镜像的话约 1 分钟）。

打开生成的入口类，长这样：

```java
package com.ceyu.userapi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication   // = @Configuration + @EnableAutoConfiguration + @ComponentScan
public class UserApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserApiApplication.class, args);
    }
}
```

直接运行它，控制台出现 `Tomcat started on port 8080` 即启动成功——你手写过 HTTP 服务器，知道这背后是监听 + 解析 + 路由那一套。

## 步骤 2：分层建包

在 `com.ceyu.userapi` 下建三个包，形成标准三层结构：

```
com.ceyu.userapi
├── controller     ← 接收 HTTP 请求，参数解析
├── service        ← 业务逻辑
└── model          ← 数据模型
```

`model` 包下建实体（先用内存存储，数据库下一篇接入）：

```java
package com.ceyu.userapi.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data                    // Lombok：自动生成 getter/setter/toString
@AllArgsConstructor
public class User {
    private Long id;
    private String name;
    private Integer age;
}
```

## 步骤 3：Service —— 业务层（内存版 CRUD）

```java
package com.ceyu.userapi.service;

import com.ceyu.userapi.model.User;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service   // 注册为 Bean，等价于我们第 12 篇的 @MiniComponent
public class UserService {
    private final Map<Long, User> db = new ConcurrentHashMap<>();
    private final AtomicLong idGen = new AtomicLong(1);

    public List<User> list() { return List.copyOf(db.values()); }

    public User getById(Long id) {
        User user = db.get(id);
        if (user == null) throw new IllegalArgumentException("用户不存在, id=" + id);
        return user;
    }

    public User create(String name, Integer age) {
        long id = idGen.getAndIncrement();
        User user = new User(id, name, age);
        db.put(id, user);
        return user;
    }

    public User update(Long id, String name, Integer age) {
        User user = getById(id);
        user.setName(name);
        user.setAge(age);
        return user;
    }

    public void delete(Long id) { db.remove(id); }
}
```

## 步骤 4：Controller —— 一组 REST API

```java
package com.ceyu.userapi.controller;

import com.ceyu.userapi.model.User;
import com.ceyu.userapi.service.UserService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController                 // = @Controller + 每个方法返回值直接序列化为 JSON
@RequestMapping("/api/users")   // 类级路径前缀
public class UserController {

    private final UserService userService;

    // 构造器注入（Spring 推荐方式，唯一构造器可省略 @Autowired）
    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping                       // GET /api/users
    public List<User> list() { return userService.list(); }

    @GetMapping("/{id}")              // GET /api/users/1（路径变量）
    public User get(@PathVariable Long id) { return userService.getById(id); }

    @PostMapping                      // POST /api/users（body 传 JSON）
    public User create(@RequestBody User user) {
        return userService.create(user.getName(), user.getAge());
    }

    @PutMapping("/{id}")              // PUT /api/users/1
    public User update(@PathVariable Long id, @RequestBody User user) {
        return userService.update(id, user.getName(), user.getAge());
    }

    @DeleteMapping("/{id}")           // DELETE /api/users/1
    public void delete(@PathVariable Long id) { userService.delete(id); }
}
```

注解速记：`@PathVariable` 取路径里的值，`@RequestParam` 取 `?key=value`，`@RequestBody` 把请求 JSON 反序列化成对象。

## 步骤 5：用 IDEA HTTP Client 测试

项目根目录新建 `test.http` 文件（IDEA 原生支持，点击行号旁的 ▶ 直接发请求）：

```http
### 1. 创建用户
POST http://localhost:8080/api/users
Content-Type: application/json

{"name": "张三", "age": 20}

### 2. 查询列表
GET http://localhost:8080/api/users

### 3. 查询单个
GET http://localhost:8080/api/users/1

### 4. 更新
PUT http://localhost:8080/api/users/1
Content-Type: application/json

{"name": "张三丰", "age": 100}

### 5. 删除
DELETE http://localhost:8080/api/users/1
```

依次执行，创建请求的预期响应：

```json
{
  "id": 1,
  "name": "张三",
  "age": 20
}
```

五个接口全通，第一个 REST API 完成 🎉。

## 常见坑

### 坑 1：Controller 建到了入口类的包外面，404

**错误示范** ❌：入口类在 `com.ceyu.userapi`，Controller 建到 `com.ceyu.controller` —— `@ComponentScan` 默认只扫描**入口类所在包及其子包**，包外的 Bean 根本不会注册，接口 404。

**正确写法**：所有组件放在入口类的子包下 ✅（步骤 2 的结构）。

### 坑 2：POST 请求报 415 Unsupported Media Type

**原因**：请求没带 `Content-Type: application/json` 头，Spring 不知道 body 是 JSON。

**正确写法**：发 JSON 请求必须带上该请求头 ✅（见 test.http 中的写法）。

### 坑 3：Lombok 注解不生效，getter 找不到

**原因**：没装 Lombok 插件或没开注解处理。

**解法**：新版 IDEA 已内置 Lombok 插件；再确认 `Settings → Build → Compiler → Annotation Processors` 勾选 `Enable annotation processing` ✅。

## 小结

- ✅ start.spring.io 生成项目，`@SpringBootApplication` 一键启动内嵌 Tomcat
- ✅ 三层结构：Controller（收请求）→ Service（写业务）→ Model（数据）
- ✅ REST 五件套：`@Get/Post/Put/DeleteMapping` + `@PathVariable/@RequestBody`
- ✅ IDEA 的 `.http` 文件是最顺手的接口测试工具

目前数据存在内存里，重启就丢。下一篇接入真数据库：**《Spring Boot 整合 MyBatis-Plus：CRUD 一条龙实操》**，敬请期待。

> 上一篇：《Maven 从入门到熟练：依赖管理、多模块、常用命令速查》
> 本系列完整目录见博客「技术博文」分类。
