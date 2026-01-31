# 判断是否为tuple类型

[http://purecpp.org/detail?id=30](http://purecpp.org/detail?id=30)

模板偏特化以及类型推断，同时支持其他容器类型检测

```C++
template <typename T, template <typename...> class Template>
struct is_specialization_of : std::false_type {};

template <template <typename...> class Template, typename... Args>
struct is_specialization_of<Template<Args...>, Template>
  : std::true_type {};

template<typename T> struct is_tuple : is_specialization_of
<typename std::decay<T>::type, std::tuple> {};

template<typename T> struct is_queue : is_specialization_of
<typename std::decay<T>::type, std::queue>{};

template<typename T> struct is_stack : is_specialization_of
<typename std::decay<T>::type, std::stack>{};

template<typename T> struct is_priority_queue : is_specialization_of
<typename std::decay<T>::type, std::priority_queue>{};

std::cout << is_tuple<std::tuple<double>>::value << std::endl;//true;

```


