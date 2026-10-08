---
title: Spring Boot 整合 MyBatis-Plus：CRUD 一条龙实操
date: 2026-08-14 10:00:00
categories: 技术博文
tags: [Java, Spring Boot, MyBatis-Plus, MySQL]
---

这是「Java 从基础到实战」系列的第 17 篇。上一篇的用户数据存在内存里，重启即失。本文接入 MySQL + MyBatis-Plus：从 Docker 起库、建表，到实体映射、单表 CRUD 零 SQL 实现，一条龙跑通。

<!-- more -->

## 前言

MyBatis-Plus（MP）在 MyBatis 之上封装了通用 Mapper：单表增删改查不用写一行 SQL，条件构造器代替手拼 where，是国内后端使用率最高的持久层方案。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17 |
| Spring Boot | 3.3.x |
| MyBatis-Plus | 3.5.7 |
| MySQL | 8.0（Docker） |
| Docker Desktop | 任意较新版本 |

## 步骤 1：Docker 一键起 MySQL 并建表

```powershell
docker run -d --name mysql8 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root123 mysql:8.0
```

等待约 30 秒初始化后建库建表：

```powershell
docker exec -it mysql8 mysql -uroot -proot123
```

```sql
CREATE DATABASE user_api DEFAULT CHARACTER SET utf8mb4;
USE user_api;

CREATE TABLE `user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(50)  NOT NULL COMMENT '姓名',
    `age`         INT          NOT NULL COMMENT '年龄',
    `email`       VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `deleted`     TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除:0未删 1已删',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='用户表';

INSERT INTO `user`(name, age, email) VALUES
('张三', 20, 'zhangsan@ceyu.dev'),
('李四', 25, 'lisi@ceyu.dev'),
('王五', 30, NULL);
```

## 步骤 2：添加依赖与数据源配置

在上一篇 `user-api` 项目的 `pom.xml` 中追加：

```xml
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>3.5.7</version>   <!-- 注意：Boot 3 要用 -spring-boot3- 这个 starter -->
</dependency>
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>
```

把 `src/main/resources/application.properties` 改名为 `application.yml`，写入：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/user_api?serverTimezone=Asia/Shanghai
    username: root
    password: root123

mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 控制台打印 SQL（学习期开着）
  global-config:
    db-config:
      logic-delete-field: deleted    # 全局逻辑删除字段
```

## 步骤 3：实体类映射表

替换 `model/User.java`：

```java
package com.ceyu.userapi.model;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("user")                       // 对应表名
public class User {
    @TableId(type = IdType.AUTO)         // 主键自增
    private Long id;

    private String name;                 // 驼峰字段自动映射下划线列（createTime -> create_time）
    private Integer age;
    private String email;

    @TableField(fill = FieldFill.INSERT) // 插入时自动填充（也可交给数据库默认值）
    private LocalDateTime createTime;

    @TableLogic                          // 逻辑删除标记
    private Integer deleted;
}
```

## 步骤 4：Mapper 接口 —— 零 SQL 获得 CRUD

新建 `mapper` 包和 `UserMapper.java`：

```java
package com.ceyu.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ceyu.userapi.model.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {
    // 空着就行！BaseMapper 自带 17 个 CRUD 方法
}
```

改造 `UserService`，删掉内存 Map，全部走数据库：

```java
package com.ceyu.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ceyu.userapi.mapper.UserMapper;
import com.ceyu.userapi.model.User;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserService {
    private final UserMapper userMapper;

    public UserService(UserMapper userMapper) { this.userMapper = userMapper; }

    public List<User> list() { return userMapper.selectList(null); }

    public User getById(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) throw new IllegalArgumentException("用户不存在, id=" + id);
        return user;
    }

    public User create(User user) {
        userMapper.insert(user);        // 插入后自增 id 自动回填到 user 对象
        return user;
    }

    public User update(Long id, User user) {
        user.setId(id);
        userMapper.updateById(user);
        return getById(id);
    }

    public void delete(Long id) { userMapper.deleteById(id); }   // 实际执行 UPDATE deleted=1

    /** 条件查询示例：年龄区间 + 名字模糊 + 按年龄倒序 */
    public List<User> search(String name, int minAge, int maxAge) {
        return userMapper.selectList(new LambdaQueryWrapper<User>()
                .like(name != null, User::getName, name)   // 第一个参数是生效条件
                .between(User::getAge, minAge, maxAge)
                .orderByDesc(User::getAge));
    }
}
```

Controller 基本不用动（create/update 的入参改为 `User` 即可），再加一个搜索接口：

```java
@GetMapping("/search")   // GET /api/users/search?name=张&minAge=18&maxAge=35
public List<User> search(@RequestParam(required = false) String name,
                         @RequestParam(defaultValue = "0") int minAge,
                         @RequestParam(defaultValue = "150") int maxAge) {
    return userService.search(name, minAge, maxAge);
}
```

## 步骤 5：验证

启动应用，用 `test.http` 依次执行上一篇的五个请求 + 新的搜索请求。控制台能看到 MP 打印的真实 SQL：

```
==>  Preparing: SELECT id,name,age,email,create_time,deleted FROM user
     WHERE deleted=0 AND (age BETWEEN ? AND ?) ORDER BY age DESC
==> Parameters: 18(Integer), 35(Integer)
<==      Total: 2
```

注意两个细节：所有查询自动带上了 `deleted=0`（逻辑删除生效）；删除接口执行的是 UPDATE 而非 DELETE。重启应用，数据仍在——持久化完成 🎉。

## 常见坑

### 坑 1：Boot 3 用了旧版 starter，启动报 factoryBeanObjectType 异常

**错误示范** ❌：引入 `mybatis-plus-boot-starter`（Boot 2 时代的老 starter），Boot 3 下启动直接报 `Invalid value type for attribute 'factoryBeanObjectType'`。

**正确写法**：Spring Boot 3 必须用 `mybatis-plus-spring-boot3-starter` ✅（见步骤 2）。

### 坑 2：Mapper 没被扫到，报 `Field userMapper required a bean`

**原因**：接口忘加 `@Mapper` 注解，或包位置在入口类扫描范围外。

**解法**：单个接口加 `@Mapper`；或在入口类上加 `@MapperScan("com.ceyu.userapi.mapper")` 一次性扫描整个包 ✅。

### 坑 3：字段名与列名对不上，查出来全是 null

**错误示范** ❌：实体字段 `createTime`，表列名却是 `createtime`（没有下划线）——MP 默认「驼峰转下划线」找 `create_time` 列，找不到就静默 null。

**正确写法**：建表规范用下划线命名 ✅；历史表不规范就用 `@TableField("createtime")` 显式指定列名。

## 小结

- ✅ Docker 一条命令起 MySQL，建表 SQL 全文可抄
- ✅ `BaseMapper<T>` 零 SQL 拿到 17 个 CRUD 方法，自增 id 自动回填
- ✅ `LambdaQueryWrapper` 方法引用写条件，杜绝手拼 SQL 和字段名拼错
- ✅ `@TableLogic` 逻辑删除：删除变 UPDATE，查询自动过滤

接口能跑通了，但参数不校验、异常直接裸奔 500。下一篇补上工程化的关键一环：**《Spring Boot 参数校验与全局异常处理：优雅返回统一结果》**，敬请期待。

> 上一篇：《Spring Boot 3 快速上手：15 分钟写出第一个 REST API》
> 本系列完整目录见博客「技术博文」分类。

