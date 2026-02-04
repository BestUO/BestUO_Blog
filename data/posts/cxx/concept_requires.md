[TOC]

# Concept & Requires
c++20的新特性，用于编译期的类型检查,在struct_pack中使用了大量的Concept做编译器类型检查
```c++
template <template-parameter-list>
concept concept-name = constraint-expression;
requires { requirement-seq } 		
requires ( parameter-list(optional) ) { requirement-seq }
```

## Concept示例
比如限制add()参数只能为算数运算法
```c++
template<typename T>
concept container = std::is_arithmetic_v<T>;

template<container T>
auto Add(T a,T b)
{
   return a+b;
}

int main()
{
    // t();
    std::cout << Add(1.2,2.2) << std::endl;				//OK
    std::cout << Add("1.2","2.2") << std::endl;			//Error
    return 0;  
}
```

constraint-expression可使用||、&&
```c++
template<typename T>
concept container = std::is_floating_point_v<T> || std::is_integral_v<T>;

template<container T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    // t();
    std::cout << Add(1.2,2.2) << std::endl;				//OK
    std::cout << Add(1,2) << std::endl;					//OK
    std::cout << Add("1","2") << std::endl;				//Error
    return 0;  
}
```

递归使用concept
```c++
template<typename T>
concept Intconcept =  std::is_integral_v<T>;

template<typename T>
concept Floatconcept = std::is_floating_point_v<T>;

template<typename T>
concept IntFloatconcept = Floatconcept<T> || Intconcept<T>;

template<IntFloatconcept T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    // t();
    std::cout << Add(1.2,2.2) << std::endl;
    std::cout << Add(1,2) << std::endl;
    // std::cout << Add("1","2") << std::endl;
    return 0;  
}
```

## Requires示例
### 简单用法
```c++
template<typename T>
concept Addable = requires (T a, T b)
{
    a + b;
};

template<Addable T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    std::cout << Add(1.2,2.2) << std::endl;
    std::cout << Add(1,2) << std::endl;
    std::cout << Add(std::string("aa"),std::string("bb")) << std::endl;
    return 0;  
}
```

### 类型 requires
```c++
template<typename T>
class Point
{
public:
    typedef T value_type;
    T x;
    T y;
    Point operator+(const Point pos)
    {
        return Point(this->x + pos.x, this->y + pos.y);
    }
};

template<typename T>
concept Container = requires
{
    typename T::value_type;
};

template<Container T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    std::cout << Add(Point<int>(1,2),Point<int>(1,2)).x << std::endl;
    std::cout << Add(std::string("aa"),std::string("bb")) << std::endl;
    return 0;  
}
```

### 嵌套 requires
```c++
template<typename T>
concept Container = requires
{
    requires std::is_arithmetic_v<T>;//嵌套的requires要求为真
};

template<Container T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    std::cout << Add(1,2) << std::endl;
    return 0;  
}
```

### requires 子句，requires requires形式
```c++
template<typename T>
class Point
{
public:
    typedef T value_type;
    T x;
    T y;
    Point operator+(const Point pos)
    {
        return Point(this->x + pos.x, this->y + pos.y);
    }
};

template<typename T>
concept Container = requires
{
    typename T::value_type;
    requires requires(typename T::value_type x)
    {
        ++x;
    };

};

template<Container T>
auto Add(T a,T b)
{
    return a+b;
}

int main()
{
    std::cout << Add(Point<int>(1,2),Point<int>(1,2)).x << std::endl;
    return 0;  
}
```

### 复合 requires
```c++
template <class T>
concept Check = requires(T a, T b) {
    { a.clear() } noexcept;  // 支持clear,且不抛异常
    { a + b } noexcept->std::same_as<int>;  // std::same_as<decltype((a + b)), int>
};
template <typename T>
concept C =
    requires(T x) {
    {*x};                                 // *x有意义
    { x + 1 } -> std::same_as<int>;       // x + 1有意义且std::same_as<decltype((x + 1)), int>，即x+1是int类型
    { x * 1 } -> std::convertible_to<T>;  // x * 1 有意义且std::convertible_to< decltype((x *1),T>，即x*1可转变为T类型
};
```

### requires与编译器bool常量一起使用
```c++
template<typename T>
constexpr bool has_member_swap=requires(T a,T b)
{
    a.swap(b);
};

template<typename T>
void clever_swap(T &a,T &b)
{
    if constexpr (requires(T a,T b){a.swap(b);})
    {
        a.swap(b);
    }
    else
    {
        std::swap(a,b);
    }
}
```

## 参考
* https://www.cnblogs.com/Cattle-Horse/p/16637811.html
* https://blog.csdn.net/TOPEE362/article/details/126758814