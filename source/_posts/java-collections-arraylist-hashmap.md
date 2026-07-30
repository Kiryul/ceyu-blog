---
title: Java 集合框架实战：ArrayList、HashMap 该怎么选怎么用
date: 2026-07-30 20:00:00
categories: 技术博文
tags: [Java, 集合框架, ArrayList, HashMap]
---

这是「Java 从基础到实战」系列的第 2 篇。集合是日常开发中使用率最高的 API，本文用一个「学生成绩管理」的真实场景，讲清 ArrayList、LinkedList、HashMap、HashSet 各自该在什么时候用、怎么用，并复现 3 个新手最容易踩的坑。所有代码在 JDK 17 下可直接运行。

<!-- more -->

## 前言

「存一堆数据该用 List 还是 Map？」「遍历时删除元素为什么会抛异常？」这些问题几乎每个 Java 新手都会遇到。本文不背八股，全部用可运行的代码说话：每种集合先给选型结论，再给场景代码，最后集中拆解常见坑。

## 环境准备

| 软件 | 版本 |
|------|------|
| JDK | 17（Eclipse Temurin） |
| IntelliJ IDEA | Community 社区版 |

> 环境搭建见上一篇：《从零搭建 Java 开发环境：JDK 17 + IntelliJ IDEA 保姆级教程》。

在 IDEA 中打开上篇创建的 `java-basics` 项目，右键 `src` 目录 → `New → Package`，创建包 `collection`，本文所有类都放在这个包下。

## 步骤 1：一张表看懂选型

先给结论，后面逐个验证：

| 集合 | 底层结构 | 适用场景 | 典型操作复杂度 |
|------|----------|----------|----------------|
| `ArrayList` | 动态数组 | 按索引随机访问多、尾部追加多（**默认首选**） | 随机访问 O(1)，中间插入/删除 O(n) |
| `LinkedList` | 双向链表 | 头尾频繁插入删除（队列/栈场景） | 头尾插删 O(1)，随机访问 O(n) |
| `HashMap` | 数组 + 链表/红黑树 | 键值对查找（**用得最多的 Map**） | 存取平均 O(1) |
| `HashSet` | 基于 HashMap | 去重、判断「是否存在」 | 增删查平均 O(1) |

> 💡 记住一条经验法则：**列表用 ArrayList，键值对用 HashMap，去重用 HashSet**，能覆盖日常 90% 的场景；只有明确遇到性能瓶颈时才考虑换实现。

## 步骤 2：ArrayList —— 有序列表的默认选择

场景：录入一个班级的学生名单，按顺序展示。

在 `collection` 包下新建 `ArrayListDemo.java`：

```java
package collection;

import java.util.ArrayList;
import java.util.List;

public class ArrayListDemo {
    public static void main(String[] args) {
        // 声明用接口 List，实现用 ArrayList，方便以后更换实现
        List<String> students = new ArrayList<>();

        students.add("张三");
        students.add("李四");
        students.add("王五");
        students.add(1, "赵六");        // 在索引 1 处插入

        System.out.println("名单：" + students);
        System.out.println("第 1 位：" + students.get(0));   // 随机访问，O(1)
        System.out.println("人数：" + students.size());

        students.remove("李四");        // 按元素删除
        System.out.println("删除后：" + students);

        // 推荐的遍历方式：增强 for
        for (String name : students) {
            System.out.println("学生：" + name);
        }
    }
}
```

运行（`Shift + F10`），预期输出：

```
名单：[张三, 赵六, 李四, 王五]
第 1 位：张三
人数：4
删除后：[张三, 赵六, 王五]
学生：张三
学生：赵六
学生：王五
```

> 💡 如果能预估元素数量，用 `new ArrayList<>(1000)` 指定初始容量，可避免扩容时的数组复制开销。

## 步骤 3：HashMap —— 键值对查找的主力

场景：根据学生姓名查成绩，这是 Map 的典型用法。

新建 `HashMapDemo.java`：

```java
package collection;

import java.util.HashMap;
import java.util.Map;

public class HashMapDemo {
    public static void main(String[] args) {
        Map<String, Integer> scores = new HashMap<>();

        scores.put("张三", 85);
        scores.put("李四", 92);
        scores.put("王五", 78);
        scores.put("张三", 90);   // key 相同会覆盖旧值

        System.out.println("张三的成绩：" + scores.get("张三"));
        // 查不存在的 key 返回 null，用 getOrDefault 给默认值更安全
        System.out.println("赵六的成绩：" + scores.getOrDefault("赵六", 0));

        // 判断 key 是否存在
        System.out.println("是否有李四：" + scores.containsKey("李四"));

        // 推荐的遍历方式：entrySet（一次拿到 key 和 value）
        for (Map.Entry<String, Integer> entry : scores.entrySet()) {
            System.out.println(entry.getKey() + " -> " + entry.getValue());
        }

        // JDK 8+ 实用方法：不存在才放入
        scores.putIfAbsent("孙七", 60);
        // 统计类场景神器：merge（在旧值基础上累加）
        scores.merge("张三", 5, Integer::sum);
        System.out.println("加分后张三：" + scores.get("张三"));
    }
}
```

预期输出（HashMap **不保证顺序**，遍历顺序可能与你不同）：

```
张三的成绩：90
赵六的成绩：0
是否有李四：true
李四 -> 92
张三 -> 90
王五 -> 78
加分后张三：95
```

> 💡 需要按插入顺序遍历用 `LinkedHashMap`，需要按 key 排序用 `TreeMap`，用法与 HashMap 完全一致，换个实现类即可。

## 步骤 4：HashSet —— 去重与存在性判断

场景：统计一次考试中出现过的所有分数档（自动去重）。

新建 `HashSetDemo.java`：

```java
package collection;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class HashSetDemo {
    public static void main(String[] args) {
        List<Integer> allScores = List.of(85, 92, 78, 85, 92, 60, 78);

        // 把 List 塞进 Set，重复元素自动丢弃
        Set<Integer> distinctScores = new HashSet<>(allScores);
        System.out.println("去重后的分数档：" + distinctScores);

        // 存在性判断：O(1)，比 List.contains 的 O(n) 快得多
        System.out.println("有人考 60 分吗：" + distinctScores.contains(60));
        System.out.println("有人考 100 分吗：" + distinctScores.contains(100));
    }
}
```

预期输出：

```
去重后的分数档：[85, 60, 92, 78]
有人考 60 分吗：true
有人考 100 分吗：false
```

> 💡 大列表里做「是否包含」判断时，先转成 HashSet 再查，是最常见的性能优化手段之一。

## 步骤 5：LinkedList —— 只在队列场景考虑它

很多教程说「频繁插入删除用 LinkedList」，实际上**中间位置**的插入删除 LinkedList 并不快（找到位置本身就要 O(n)）。它真正的价值是当**队列（Queue）/双端队列（Deque）**用：

新建 `LinkedListDemo.java`：

```java
package collection;

import java.util.ArrayDeque;
import java.util.Deque;

public class LinkedListDemo {
    public static void main(String[] args) {
        // 排队叫号场景：先进先出（FIFO）
        // 实际开发中 ArrayDeque 比 LinkedList 更快，优先用它
        Deque<String> queue = new ArrayDeque<>();
        queue.offer("张三");   // 入队
        queue.offer("李四");
        queue.offer("王五");

        System.out.println("下一位：" + queue.poll());   // 出队：张三
        System.out.println("下一位：" + queue.poll());   // 出队：李四
        System.out.println("还在排队：" + queue);
    }
}
```

预期输出：

```
下一位：张三
下一位：李四
还在排队：[王五]
```

> 💡 结论：日常开发中 LinkedList 出场机会很少——列表用 ArrayList，队列用 ArrayDeque。

## 常见坑

### 坑 1：遍历时删除元素，抛 `ConcurrentModificationException`

场景：把不及格（<60 分）的成绩从列表中移除。

**错误示范**（增强 for 中直接 remove）❌：

```java
List<Integer> scores = new ArrayList<>(List.of(85, 45, 92, 30));
for (Integer score : scores) {
    if (score < 60) {
        scores.remove(score);   // 运行时抛 ConcurrentModificationException
    }
}
```

**正确写法一**：用迭代器的 `remove` ✅

```java
Iterator<Integer> it = scores.iterator();
while (it.hasNext()) {
    if (it.next() < 60) {
        it.remove();
    }
}
```

**正确写法二**：JDK 8+ 的 `removeIf`（推荐，一行搞定）✅

```java
scores.removeIf(score -> score < 60);
```

### 坑 2：`Arrays.asList` / `List.of` 返回的列表不能增删

**错误示范** ❌：

```java
List<String> names = Arrays.asList("张三", "李四");
names.add("王五");   // 抛 UnsupportedOperationException
```

**原因**：`Arrays.asList` 返回的是定长视图，`List.of` 返回的是不可变集合，都不支持增删。

**正确写法**：需要可变列表时，包一层 ArrayList ✅

```java
List<String> names = new ArrayList<>(Arrays.asList("张三", "李四"));
names.add("王五");   // 正常
```

### 坑 3：自定义类作 HashMap 的 key，忘记重写 `equals` 和 `hashCode`

**错误示范** ❌：

```java
class Student {
    String name;
    Student(String name) { this.name = name; }
}

Map<Student, Integer> map = new HashMap<>();
map.put(new Student("张三"), 90);
// 用"相同内容"的新对象去查，结果是 null！
System.out.println(map.get(new Student("张三")));   // null
```

**原因**：没重写 `hashCode`/`equals` 时，比较的是对象内存地址，两个 `new` 出来的对象永远不相等。

**正确写法**：用 JDK 17 的 `record`，自动生成 `equals`/`hashCode` ✅

```java
record Student(String name) {}

Map<Student, Integer> map = new HashMap<>();
map.put(new Student("张三"), 90);
System.out.println(map.get(new Student("张三")));   // 90
```

普通类则用 IDEA 快捷键 `Alt + Insert` → `equals() and hashCode()` 自动生成。

## 小结

本文用学生成绩管理场景过了一遍最常用的四种集合：

- ✅ 列表默认用 **ArrayList**，队列用 **ArrayDeque**
- ✅ 键值查找用 **HashMap**，配合 `getOrDefault`、`merge` 事半功倍
- ✅ 去重和存在性判断用 **HashSet**
- ✅ 避开三大坑：遍历中删除用 `removeIf`、`Arrays.asList` 不可增删、自定义 key 必须重写 `equals`/`hashCode`

下一篇我们解决集合泛型背后的疑惑：**《一文吃透 Java 泛型：从 `List<T>` 到通配符 `? extends`》**，搞懂为什么 `List<Integer>` 不能赋值给 `List<Number>`，敬请期待。

> 上一篇：《从零搭建 Java 开发环境：JDK 17 + IntelliJ IDEA 保姆级教程》
> 本系列完整目录见博客「技术博文」分类，每两周更新一篇。
