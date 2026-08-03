---
title: Java 8 Stream 流式编程实战：告别 for 循环的 20 个例子
date: 2026-08-02 10:00:00
categories: 技术博文
tags: [Java, Stream, Lambda, 函数式编程]
---

这是「Java 从基础到实战」系列的第 5 篇。Stream 是 Java 8 之后处理集合的标准姿势，本文不讲理论，直接给 20 个日常开发最高频的可复制片段：过滤、映射、分组、归约、排序一网打尽。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

同样一个「筛选 + 转换 + 统计」的需求，for 循环要写 10 行，Stream 一行搞定且可读性更好。本文所有例子基于同一份学生数据，边看边在 IDEA 里跑。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

在 `java-basics` 项目中新建包 `stream`，创建统一的测试数据类 `Data.java`：

```java
package stream;

import java.util.List;

public class Data {
    public record Student(String name, String clazz, int score) {}

    public static final List<Student> STUDENTS = List.of(
            new Student("张三", "一班", 85),
            new Student("李四", "一班", 58),
            new Student("王五", "二班", 92),
            new Student("赵六", "二班", 74),
            new Student("孙七", "三班", 92),
            new Student("周八", "三班", 45)
    );
}
```

Stream 的固定套路：**数据源 → 中间操作（可多个，惰性）→ 终止操作（触发执行）**。

## 例 1~5：过滤与查找

新建 `FilterDemo.java`（后续例子可都写在各自 main 中运行验证）：

```java
// 1. filter：筛选及格的学生
List<Student> passed = STUDENTS.stream()
        .filter(s -> s.score() >= 60)
        .toList();                       // JDK 16+ 直接 toList()

// 2. 多条件过滤：一班且及格
List<Student> r2 = STUDENTS.stream()
        .filter(s -> s.clazz().equals("一班"))
        .filter(s -> s.score() >= 60)
        .toList();

// 3. anyMatch：是否存在满分以上（任意匹配即 true）
boolean hasExcellent = STUDENTS.stream().anyMatch(s -> s.score() >= 90);

// 4. allMatch / noneMatch：是否全部及格 / 是否无人缺考
boolean allPassed = STUDENTS.stream().allMatch(s -> s.score() >= 60);

// 5. findFirst：找第一个不及格的学生（返回 Optional，强制处理空情况）
Optional<Student> firstFailed = STUDENTS.stream()
        .filter(s -> s.score() < 60)
        .findFirst();
firstFailed.ifPresent(s -> System.out.println("第一个不及格: " + s.name()));
```

## 例 6~10：映射与转换

```java
// 6. map：只取姓名列表
List<String> names = STUDENTS.stream().map(Student::name).toList();

// 7. map + 计算：所有人加 5 分后的分数列表
List<Integer> adjusted = STUDENTS.stream().map(s -> s.score() + 5).toList();

// 8. distinct：所有出现过的分数（去重）
List<Integer> distinctScores = STUDENTS.stream()
        .map(Student::score).distinct().toList();

// 9. flatMap：把多个班级名单拍平成一个列表
List<List<String>> classes = List.of(List.of("张三", "李四"), List.of("王五"));
List<String> flat = classes.stream().flatMap(List::stream).toList();
// 结果：[张三, 李四, 王五]

// 10. mapToInt：转成数值流做统计（避免装箱开销）
IntSummaryStatistics stats = STUDENTS.stream()
        .mapToInt(Student::score).summaryStatistics();
System.out.printf("平均 %.1f，最高 %d，最低 %d%n",
        stats.getAverage(), stats.getMax(), stats.getMin());
// 输出：平均 74.3，最高 92，最低 45
```

## 例 11~15：排序与截取

```java
// 11. sorted：按分数升序
List<Student> asc = STUDENTS.stream()
        .sorted(Comparator.comparingInt(Student::score)).toList();

// 12. 降序 + 多级排序：分数降序，同分按姓名排
List<Student> desc = STUDENTS.stream()
        .sorted(Comparator.comparingInt(Student::score).reversed()
                .thenComparing(Student::name))
        .toList();

// 13. limit：成绩前 3 名
List<Student> top3 = STUDENTS.stream()
        .sorted(Comparator.comparingInt(Student::score).reversed())
        .limit(3).toList();

// 14. skip：跳过前 3 名取剩余（配合 limit 可做内存分页）
List<Student> rest = STUDENTS.stream()
        .sorted(Comparator.comparingInt(Student::score).reversed())
        .skip(3).toList();

// 15. max：分数最高的学生
Optional<Student> topOne = STUDENTS.stream()
        .max(Comparator.comparingInt(Student::score));
```

## 例 16~20：收集与分组（collect 是精华）

```java
// 16. toMap：姓名 -> 分数 的映射
Map<String, Integer> nameScore = STUDENTS.stream()
        .collect(Collectors.toMap(Student::name, Student::score));

// 17. groupingBy：按班级分组（最常用！）
Map<String, List<Student>> byClass = STUDENTS.stream()
        .collect(Collectors.groupingBy(Student::clazz));

// 18. groupingBy + counting：每个班有几人
Map<String, Long> countByClass = STUDENTS.stream()
        .collect(Collectors.groupingBy(Student::clazz, Collectors.counting()));
// {一班=2, 三班=2, 二班=2}

// 19. groupingBy + averagingInt：每个班的平均分
Map<String, Double> avgByClass = STUDENTS.stream()
        .collect(Collectors.groupingBy(Student::clazz,
                Collectors.averagingInt(Student::score)));
// {一班=71.5, 三班=68.5, 二班=83.0}

// 20. partitioningBy：按及格与否一分为二（true/false 两组）
Map<Boolean, List<Student>> passFail = STUDENTS.stream()
        .collect(Collectors.partitioningBy(s -> s.score() >= 60));
System.out.println("不及格名单: " + passFail.get(false).stream()
        .map(Student::name).collect(Collectors.joining("、")));
// 输出：不及格名单: 李四、周八
```

## 常见坑

### 坑 1：Stream 只能消费一次

**错误示范** ❌：

```java
Stream<Student> s = STUDENTS.stream();
s.count();
s.toList();   // 抛 IllegalStateException: stream has already been operated upon or closed
```

**正确写法**：每次操作都从集合重新 `.stream()` ✅。

### 坑 2：toMap 遇到重复 key 直接抛异常

**错误示范** ❌：

```java
// 两个 92 分：按分数做 key 会抛 IllegalStateException: Duplicate key
Map<Integer, String> m = STUDENTS.stream()
        .collect(Collectors.toMap(Student::score, Student::name));
```

**正确写法**：提供第三个参数（合并函数）处理冲突 ✅：

```java
Map<Integer, String> m = STUDENTS.stream()
        .collect(Collectors.toMap(Student::score, Student::name,
                (a, b) -> a + "," + b));   // 冲突时拼接
```

### 坑 3：滥用 parallelStream

**错误示范**：数据量几百条也上并行流 ❌。并行流有线程调度开销，小数据量反而更慢，且默认共用全局 ForkJoinPool，在 Web 应用里可能互相拖累。

**正确写法**：默认用串行流；只有「数据量大（万级以上）+ 无共享状态 + CPU 密集」才考虑并行，并用实际压测验证 ✅。

## 小结

- ✅ 套路：数据源 → 中间操作（filter/map/sorted）→ 终止操作（toList/collect/count）
- ✅ 最高频组合：`filter + map + toList`、`groupingBy + counting/averagingInt`
- ✅ 三个坑：流不可复用、toMap 重复 key、并行流别乱用

下一篇是阶段一收官：**《Java IO 与 NIO 入门：文件读写的 5 种方式及性能对比》**，附实测数据，敬请期待。

> 上一篇：《Java 异常处理最佳实践：try-with-resources 与自定义异常》
> 本系列完整目录见博客「技术博文」分类。
