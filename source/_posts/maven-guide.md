---
title: Maven 从入门到熟练：依赖管理、多模块、常用命令速查
date: 2026-08-12 10:00:00
categories: 技术博文
tags: [Java, Maven, 构建工具, 依赖管理]
---

这是「Java 从基础到实战」系列的第 15 篇，进入阶段三「生态与框架」。学 Spring Boot 之前必须过 Maven 这一关：本文覆盖安装配置国内镜像、看懂 pom.xml、依赖冲突排查和多模块搭建，附一张常用命令速查表。

<!-- more -->

## 前言

之前我们用 IDEA 自带构建系统写 demo 足够了，但真实项目 100% 用 Maven/Gradle 管理依赖和构建。Maven 学习成本低、生态资料多，是后端项目的事实标准。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版（内置 Maven，无需单独安装） |

> IDEA 自带 Maven（`Settings → Build Tools → Maven` 可见 Bundled 版本），学习阶段直接用它即可，不必单独下载安装。

## 步骤 1：配置国内镜像（必做，快 10 倍）

Maven 默认从国外中央仓库下载依赖，国内速度感人。配置阿里云镜像：

1. 打开目录 `C:\Users\你的用户名\.m2\`（没有就手动创建）；
2. 新建 `settings.xml`，写入：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
    <mirrors>
        <mirror>
            <id>aliyunmaven</id>
            <mirrorOf>central</mirrorOf>
            <name>阿里云公共仓库</name>
            <url>https://maven.aliyun.com/repository/public</url>
        </mirror>
    </mirrors>
</settings>
```

3. IDEA 中 `Settings → Build Tools → Maven`，确认 `User settings file` 指向这个文件（勾选 Override）。

## 步骤 2：创建第一个 Maven 项目，看懂 pom.xml

IDEA 中 `New Project` → 选 **Maven Archetype** 或直接 Build system 选 **Maven**，Name 填 `maven-demo`。生成的 `pom.xml` 骨架：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- 项目坐标：GAV，全球唯一定位一个构件 -->
    <groupId>com.ceyu</groupId>          <!-- 组织，通常是域名倒写 -->
    <artifactId>maven-demo</artifactId>  <!-- 项目名 -->
    <version>1.0.0</version>             <!-- 版本 -->
    <packaging>jar</packaging>           <!-- 打包类型：jar / war / pom -->

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <!-- 依赖也用 GAV 坐标声明，Maven 自动下载 + 传递依赖 -->
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>2.11.0</version>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.10.2</version>
            <scope>test</scope>          <!-- 只在测试期生效，不打进产物 -->
        </dependency>
    </dependencies>
</project>
```

保存后点右上角的 Maven 刷新图标（或 `Ctrl+Shift+O`），依赖自动下载到 `~/.m2/repository` 本地仓库。

验证：写一个用 Gson 的类跑一下：

```java
import com.google.gson.Gson;

public class GsonTest {
    record User(String name, int age) {}
    public static void main(String[] args) {
        System.out.println(new Gson().toJson(new User("张三", 20)));
        // 输出：{"name":"张三","age":20}
    }
}
```

依赖范围（scope）速记：

| scope | 生效范围 | 典型例子 |
|-------|----------|----------|
| compile（默认） | 编译 + 测试 + 运行 | 绝大多数依赖 |
| test | 仅测试 | junit、mockito |
| provided | 编译期有效，运行时由容器提供 | lombok、servlet-api |
| runtime | 运行时才需要 | JDBC 驱动 |

## 步骤 3：常用命令与生命周期

Maven 生命周期是链式的：执行后面的阶段会自动带上前面所有阶段。

```powershell
mvn clean          # 删除 target 目录
mvn compile        # 编译 src/main/java
mvn test           # 编译 + 跑单元测试
mvn package        # 编译 + 测试 + 打 jar 包（产物在 target/）
mvn install        # 以上全部 + 安装到本地仓库供其他项目引用
mvn clean package -DskipTests   # 最常用组合：清理打包跳过测试
```

IDEA 中不用敲命令：右侧 Maven 面板 → Lifecycle 里双击即可，双击前按住 Ctrl 可多选串行执行。

## 步骤 4：依赖冲突排查（高频实战技能）

现象：明明引了依赖却 `NoSuchMethodError` / `ClassNotFoundException`——十有八九是**同一个库被传递依赖引入了多个版本**，Maven 按「就近原则」选了一个旧的。

排查三步：

```powershell
# 1. 打印依赖树，找出谁引入了冲突版本
mvn dependency:tree -Dincludes=com.google.guava

# 输出示例：两个路径分别引入 guava 31 和 19
# [INFO] +- com.foo:lib-a:1.0 -> com.google.guava:guava:31.1-jre
# [INFO] \- com.bar:lib-b:2.0 -> com.google.guava:guava:19.0
```

```xml
<!-- 2. 在引入旧版本的依赖上 exclusion 排除它 -->
<dependency>
    <groupId>com.bar</groupId>
    <artifactId>lib-b</artifactId>
    <version>2.0</version>
    <exclusions>
        <exclusion>
            <groupId>com.google.guava</groupId>
            <artifactId>guava</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<!-- 3. 或者用 dependencyManagement 强制统一版本（推荐） -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.google.guava</groupId>
            <artifactId>guava</artifactId>
            <version>31.1-jre</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

> 💡 IDEA 图形化排查更直观：`pom.xml` 上右键 → `Maven → Show Dependencies`，红线就是冲突。

## 步骤 5：多模块项目 —— 实战篇的项目结构预演

真实项目通常拆成多模块。父 pom 管版本，子模块继承：

```
takeout-diary/                    ← 父工程（packaging = pom）
├── pom.xml
├── diary-common/                 ← 公共工具模块
│   └── pom.xml
├── diary-service/                ← 业务模块（依赖 common）
│   └── pom.xml
```

父 `pom.xml` 核心配置：

```xml
<groupId>com.ceyu</groupId>
<artifactId>takeout-diary</artifactId>
<version>1.0.0</version>
<packaging>pom</packaging>            <!-- 父工程必须是 pom -->

<modules>
    <module>diary-common</module>
    <module>diary-service</module>
</modules>

<dependencyManagement>                <!-- 统一管理版本，子模块引用时不写 version -->
    <dependencies>
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>2.11.0</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

子模块 `diary-service/pom.xml`：

```xml
<parent>
    <groupId>com.ceyu</groupId>
    <artifactId>takeout-diary</artifactId>
    <version>1.0.0</version>
</parent>
<artifactId>diary-service</artifactId>

<dependencies>
    <dependency>                       <!-- 依赖兄弟模块 -->
        <groupId>com.ceyu</groupId>
        <artifactId>diary-common</artifactId>
        <version>1.0.0</version>
    </dependency>
    <dependency>                       <!-- 版本由父 pom 管理，此处省略 version -->
        <groupId>com.google.code.gson</groupId>
        <artifactId>gson</artifactId>
    </dependency>
</dependencies>
```

## 常见坑

### 坑 1：改了 pom.xml 没刷新，代码里 import 爆红

**现象**：加了依赖，代码里却找不到类。**解法**：pom 变更后必须点 Maven 刷新图标（IDEA 右上角悬浮的小图标，或 `Ctrl+Shift+O`）✅。建议 `Settings → Build Tools → Maven → Importing` 勾选自动导入。

### 坑 2：本地仓库损坏，报 `Could not resolve dependencies` 但网络正常

**原因**：下载中断产生 `.lastUpdated` 残留文件，Maven 不再重试。

**解法**：删除对应目录后重新刷新 ✅：

```powershell
# 例如 gson 下载失败，删掉它在本地仓库的目录
Remove-Item -Recurse $env:USERPROFILE\.m2\repository\com\google\code\gson
```

（或用 `mvn -U clean package` 强制更新快照。）

### 坑 3：`No compiler is provided` —— Maven 用了 JRE 而不是 JDK

**原因**：`Settings → Build Tools → Maven → Runner` 或 `JAVA_HOME` 指向了 JRE。

**解法**：确认 IDEA 的 Maven Runner JRE 选择的是 JDK 17（第 1 篇装的 Temurin），`JAVA_HOME` 指向 JDK 根目录 ✅。

## 小结

- ✅ GAV 坐标定位一切；scope 控制依赖生效范围
- ✅ 高频命令：`mvn clean package -DskipTests`
- ✅ 冲突排查三板斧：`dependency:tree` → exclusion → dependencyManagement
- ✅ 多模块：父 pom 管版本，子模块继承，为实战篇打好地基

下一篇正式进入框架时代：**《Spring Boot 3 快速上手：15 分钟写出第一个 REST API》**，敬请期待。

> 上一篇：《JDK 17/21 新特性实战：Record、密封类、虚拟线程》
> 本系列完整目录见博客「技术博文」分类。
