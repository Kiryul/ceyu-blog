---
title: 从零搭建 Java 开发环境：JDK 17 + IntelliJ IDEA 保姆级教程
date: 2026-07-30 20:00:00
categories: 技术博文
tags: [Java, JDK, IntelliJ IDEA, 环境搭建]
---

这是「Java 从基础到实战」系列的第 1 篇。本文带你在 Windows 上从零搭建一套标准的 Java 开发环境：安装 JDK 17、配置环境变量、安装 IntelliJ IDEA，并在 IDEA 中跑通第一个 Java 程序。全程可照抄，预计耗时 30 分钟。

<!-- more -->

## 前言

工欲善其事，必先利其器。很多初学者在第一步「装环境」就被劝退——下错版本、环境变量配错、IDEA 里找不到 JDK。本文把每一步的操作、命令和预期输出都写清楚，跟着做即可一次成功。

## 环境准备

| 软件 | 版本 | 说明 |
|------|------|------|
| 操作系统 | Windows 10 / 11（64 位） | 本文以 Windows 为例 |
| JDK | 17（LTS 长期支持版） | 选用 Eclipse Temurin 发行版，免费可商用 |
| IntelliJ IDEA | Community 社区版（免费） | 学习阶段社区版完全够用 |

> **为什么选 JDK 17 而不是 8 或 21？**
> JDK 8 已经过于老旧；JDK 17 是当前企业使用最广泛的 LTS 版本，Spring Boot 3 的最低要求就是 17。学完本系列再切 21 只需换个版本号。

## 步骤 1：下载并安装 JDK 17

Oracle 官网的 JDK 需要登录且许可证条款复杂，推荐使用完全免费的 **Eclipse Temurin**（由 Adoptium 社区维护，前身是 AdoptOpenJDK）。

1. 打开下载页：<https://adoptium.net/zh-CN/temurin/releases/?version=17>
2. 选择：
   - Operating System：**Windows**
   - Architecture：**x64**
   - Package Type：**JDK**
   - 下载 `.msi` 安装包（例如 `OpenJDK17U-jdk_x64_windows_hotspot_17.0.12_7.msi`）
3. 双击运行安装包，一路 Next。**关键一步**：在「自定义安装」界面，把以下两项都改为「将安装在本地硬盘上」：
   - `Set JAVA_HOME variable`（自动配置 JAVA_HOME）
   - `Add to PATH`（自动加入 PATH）

> 勾选这两项后，安装器会自动帮你配好环境变量，可以跳过步骤 2 的手动配置，直接到步骤 3 验证。

默认安装路径为：

```
C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot\
```

## 步骤 2：手动配置环境变量（安装器未自动配置时）

如果安装时没有勾选上面两项，或者你用的是 `.zip` 解压版，就需要手动配置。

1. 按 `Win + R`，输入 `sysdm.cpl` 回车，切到「高级」选项卡 → 点击「环境变量」。
2. 在「系统变量」区域点「新建」：
   - 变量名：`JAVA_HOME`
   - 变量值：`C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot`（以你的实际安装路径为准，**不要**带 `bin`）
3. 在「系统变量」中找到 `Path`，双击编辑 → 点「新建」，添加一行：

```
%JAVA_HOME%\bin
```

4. 一路点「确定」保存。

> ⚠️ 环境变量修改后，**已经打开的终端窗口不会生效**，必须关掉重开一个新终端再验证。

## 步骤 3：验证 JDK 安装

打开一个**新的** PowerShell 或 CMD 窗口，依次执行：

```powershell
java -version
```

预期输出（版本号可能略有差异）：

```
openjdk version "17.0.12" 2024-07-16
OpenJDK Runtime Environment Temurin-17.0.12+7 (build 17.0.12+7)
OpenJDK 64-Bit Server VM Temurin-17.0.12+7 (build 17.0.12+7, mixed mode, sharing)
```

再验证编译器：

```powershell
javac -version
```

预期输出：

```
javac 17.0.12
```

两条命令都正常输出版本号，说明 JDK 安装成功。

## 步骤 4：安装 IntelliJ IDEA 社区版

1. 打开官网下载页：<https://www.jetbrains.com/idea/download/>
2. 页面往下滚动，找到 **IntelliJ IDEA Community Edition**（社区版，免费），下载 `.exe` 安装包。**不要**下成页面顶部的 Ultimate 付费版。
3. 运行安装包，在「Installation Options」界面建议勾选：
   - `Create Desktop Shortcut`（创建桌面快捷方式）
   - `Add "Open Folder as Project"`（右键菜单增强）
   - `.java` 关联（可选）
4. 完成安装并启动，首次启动选择主题后进入欢迎页。

## 步骤 5：在 IDEA 中创建第一个项目

1. 欢迎页点击 **New Project**。
2. 按如下配置：
   - **Name**：`java-basics`
   - **Location**：`D:\java-learn`
   - **Language**：Java
   - **Build system**：IntelliJ（学习阶段够用，后续 Maven 篇再切换）
   - **JDK**：下拉框中应能自动检测到 `17 Eclipse Temurin`；如果没有，点 `Add JDK...` 手动选择 `C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot`
   - 勾选 **Add sample code**（自动生成示例代码）
3. 点击 **Create**，IDEA 会生成一个带 `Main.java` 的项目：

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello and welcome!");

        for (int i = 1; i <= 5; i++) {
            System.out.println("i = " + i);
        }
    }
}
```

4. 点击代码左侧的绿色 ▶ 按钮（或按 `Shift + F10`）运行，底部 Run 窗口输出：

```
Hello and welcome!
i = 1
i = 2
i = 3
i = 4
i = 5
```

看到输出即代表整套开发环境搭建完成。🎉

### 推荐的 3 个初始设置

进入 `File → Settings`（快捷键 `Ctrl + Alt + S`）：

| 设置项 | 位置 | 建议值 |
|--------|------|--------|
| 字体大小 | Editor → Font | Size 16（默认偏小） |
| 自动导包 | Editor → General → Auto Import | 勾选 `Add unambiguous imports on the fly` |
| 鼠标滚轮缩放字体 | Editor → General | 勾选 `Change font size with Ctrl+Mouse Wheel` |

## 常见坑

### 坑 1：`java -version` 提示"不是内部或外部命令"

**原因**：PATH 没配置成功，或者在旧终端窗口里验证。

**解法**：
1. 先关闭所有终端窗口，重新打开一个新的再试；
2. 仍失败则执行 `echo $env:JAVA_HOME`（PowerShell）检查 JAVA_HOME 是否正确，注意路径**不能**以 `\bin` 结尾，PATH 中才是 `%JAVA_HOME%\bin`。

### 坑 2：IDEA 提示 `Project JDK is not defined`，或手动添加 JDK 后无法编译

**原因**：IDEA 没有检测到 JDK，手动 `Add JDK...` 时选错了目录。

**错误示范**：选择 `C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot\bin` ❌（选到了 bin 子目录）
**正确写法**：选择 `C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot` ✅（JDK 安装根目录）

配置入口：`File → Project Structure`（快捷键 `Ctrl + Alt + Shift + S`）→ Project → SDK，选择正确的 JDK 根目录后点 Apply 即可。

### 坑 3：电脑上有多个 JDK，`java -version` 显示的不是 17

**原因**：之前装过 JDK 8 等旧版本，PATH 中旧路径排在前面（Windows 按 PATH 顺序取第一个命中的 `java.exe`）。

**解法**：编辑 Path 环境变量，把 `%JAVA_HOME%\bin` 用「上移」按钮移到列表**最顶部**；特别注意 `C:\Program Files\Common Files\Oracle\Java\javapath` 这一项经常抢占优先级，把它移到 `%JAVA_HOME%\bin` 之后或直接删除。

## 小结

本文完成了 Java 学习的第一步：

- ✅ 安装了 JDK 17（Temurin 发行版）并配置环境变量
- ✅ 安装 IntelliJ IDEA 社区版并跑通第一个项目

环境就绪后，就可以专心写代码了。下一篇我们进入实战高频区：**《Java 集合框架实战：ArrayList、HashMap 该怎么选怎么用》**，讲清楚日常开发中使用率最高的几种容器和它们的坑，敬请期待。

> 本系列完整目录见博客「技术博文」分类，每两周更新一篇。
