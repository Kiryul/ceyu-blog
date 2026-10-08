---
title: Spring Boot 参数校验与全局异常处理：优雅返回统一结果
date: 2026-08-15 10:00:00
categories: 技术博文
tags: [Java, Spring Boot, 参数校验, 全局异常]
---

这是「Java 从基础到实战」系列的第 18 篇。目前的接口传空名字照收、查不到用户直接 500 报错页——本文补上生产级接口的两块拼图：@Valid 声明式参数校验 + @RestControllerAdvice 全局异常处理，让所有响应都长成统一格式。

<!-- more -->

## 前言

还记得第 3 篇手写的 `Result<T>` 和第 4 篇的 `BizException` 吗？今天它们正式上岗。目标效果：无论成功、参数错误还是业务失败，前端拿到的永远是 `{code, message, data}` 三件套。

## 环境准备

继续使用 `user-api` 项目（Spring Boot 3.3.x + MyBatis-Plus），`pom.xml` 追加校验 starter：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

## 步骤 1：定义统一返回体与业务异常

新建 `common` 包，放入第 3 篇写过的 `Result<T>`（略作精简）：

```java
package com.ceyu.userapi.common;

public record Result<T>(int code, String message, T data) {
    public static <T> Result<T> ok(T data) { return new Result<>(0, "success", data); }
    public static Result<Void> fail(int code, String message) {
        return new Result<>(code, message, null);
    }
}
```

以及第 4 篇的 `BizException`：

```java
package com.ceyu.userapi.common;

public class BizException extends RuntimeException {
    private final int code;

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }
    public int getCode() { return code; }
}
```

Service 中的裸异常全部换成它：

```java
public User getById(Long id) {
    User user = userMapper.selectById(id);
    if (user == null) throw new BizException(40401, "用户不存在, id=" + id);
    return user;
}
```

## 步骤 2：入参 DTO + 校验注解

不要拿实体类直接接收请求（会把 id、deleted 等内部字段暴露给前端）。新建 `dto` 包：

```java
package com.ceyu.userapi.dto;

import jakarta.validation.constraints.*;

public record UserCreateDto(
        @NotBlank(message = "姓名不能为空")
        @Size(max = 50, message = "姓名不能超过 50 字")
        String name,

        @NotNull(message = "年龄不能为空")
        @Min(value = 0, message = "年龄不能为负数")
        @Max(value = 150, message = "年龄不能超过 150")
        Integer age,

        @Email(message = "邮箱格式不正确")
        String email
) {}
```

> ⚠️ Spring Boot 3 的校验注解在 `jakarta.validation` 包（不是老的 `javax.validation`），import 别选错。

常用注解速查：

| 注解 | 作用 | 适用类型 |
|------|------|----------|
| `@NotNull` | 不能为 null | 任意 |
| `@NotBlank` | 非 null 且去空格后非空 | String |
| `@NotEmpty` | 非 null 且长度>0 | 集合/String |
| `@Min` / `@Max` | 数值范围 | 数值 |
| `@Size` | 长度/元素个数范围 | String/集合 |
| `@Email` / `@Pattern` | 格式校验 | String |

## 步骤 3：Controller 挂上 @Valid，返回统一 Result

```java
package com.ceyu.userapi.controller;

import com.ceyu.userapi.common.Result;
import com.ceyu.userapi.dto.UserCreateDto;
import com.ceyu.userapi.model.User;
import com.ceyu.userapi.service.UserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) { this.userService = userService; }

    @GetMapping("/{id}")
    public Result<User> get(@PathVariable Long id) {
        return Result.ok(userService.getById(id));
    }

    @PostMapping
    public Result<User> create(@Valid @RequestBody UserCreateDto dto) {   // @Valid 触发校验
        return Result.ok(userService.create(dto));
    }

    @GetMapping
    public Result<List<User>> list() { return Result.ok(userService.list()); }
    // 其余接口同理，返回值统一包 Result.ok(...)
}
```

`UserService.create` 相应改为接收 DTO：

```java
public User create(UserCreateDto dto) {
    User user = new User();
    user.setName(dto.name());
    user.setAge(dto.age());
    user.setEmail(dto.email());
    userMapper.insert(user);
    return user;
}
```

## 步骤 4：全局异常处理器 —— 一个类接住所有异常

新建 `common/GlobalExceptionHandler.java`，这是全文核心：

```java
package com.ceyu.userapi.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice   // 拦截所有 Controller 抛出的异常
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 业务异常：code 原样透传，HTTP 状态给 200（业务失败不是协议失败） */
    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        log.warn("业务异常: code={}, msg={}", e.getCode(), e.getMessage());
        return Result.fail(e.getCode(), e.getMessage());
    }

    /** 参数校验失败：@Valid 不通过时 Spring 抛出这个异常 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleValid(MethodArgumentNotValidException e) {
        // 取第一条校验失败信息返回，足够前端提示
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " " + f.getDefaultMessage())
                .findFirst().orElse("参数错误");
        return Result.fail(40001, msg);
    }

    /** 兜底：预料之外的异常，隐藏细节只给通用提示，完整堆栈进日志 */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> handleOther(Exception e) {
        log.error("系统异常", e);   // 这里才是记录堆栈的唯一位置（第 4 篇的纪律）
        return Result.fail(50000, "系统繁忙，请稍后重试");
    }
}
```

## 步骤 5：验证三种响应形态

用 `test.http` 试三种情况：

```http
### 情况 1：正常创建 → 成功结构
POST http://localhost:8080/api/users
Content-Type: application/json

{"name": "张三", "age": 20, "email": "zs@ceyu.dev"}

### 情况 2：年龄传负数 → 校验失败
POST http://localhost:8080/api/users
Content-Type: application/json

{"name": "张三", "age": -1}

### 情况 3：查询不存在的用户 → 业务异常
GET http://localhost:8080/api/users/999
```

三种预期响应，结构完全统一：

```json
{"code": 0, "message": "success", "data": {"id": 4, "name": "张三", ...}}

{"code": 40001, "message": "age 年龄不能为负数", "data": null}

{"code": 40401, "message": "用户不存在, id=999", "data": null}
```

前端从此只需要判断 `code == 0`。

## 常见坑

### 坑 1：忘写 @Valid，校验注解全部失效

**错误示范** ❌：`create(@RequestBody UserCreateDto dto)` —— DTO 上的注解写得再全，没有 `@Valid` 触发就是摆设，脏数据长驱直入且毫无报错。

**正确写法**：`@Valid @RequestBody` 成对出现，形成肌肉记忆 ✅。

### 坑 2：嵌套对象校验不生效

**错误示范** ❌：DTO 里嵌套 `AddressDto address` 字段，Address 内部的 `@NotBlank` 不生效。

**正确写法**：嵌套对象字段上要加 `@Valid` 才会级联校验 ✅：

```java
@Valid @NotNull AddressDto address
```

### 坑 3：异常处理器里把 BizException 也打成 error 级堆栈

**错误示范** ❌：三个 handler 全写 `log.error("异常", e)` —— 「用户不存在」这类正常业务分支每天打几千条 ERROR 堆栈，真正的系统异常被淹没，告警形同虚设。

**正确写法**：业务异常 `log.warn` 只记一行；只有兜底的未知异常才 `log.error` 带堆栈 ✅（见步骤 4）。

## 小结

- ✅ 入参用 DTO + `jakarta.validation` 注解声明规则，`@Valid` 触发
- ✅ `@RestControllerAdvice` 三层拦截：业务异常 → 校验异常 → 未知兜底
- ✅ 响应统一 `{code, message, data}`，前端只认 `code == 0`
- ✅ 日志分级：业务 warn 一行、系统 error 带堆栈

下一篇给接口提速：**《Spring Boot 整合 Redis：缓存注解与手动缓存双方案》**，敬请期待。

> 上一篇：《Spring Boot 整合 MyBatis-Plus：CRUD 一条龙实操》
> 本系列完整目录见博客「技术博文」分类。
