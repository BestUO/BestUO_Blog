[TOC]

# struct_pack代码解读
大量的模板元编程，是学习模板元编程的好项目。大体脉络能看懂但是编码规则与布局看不大明白。先记录一下，后续有新感悟再添加
## 关键流程解读
### 使用示例
```
struct person 
{
    int64_t id;
    std::string name;
    int age;
    double salary;
};
person person1{.id = 1, .name = "hello struct pack", .age = 20, .salary = 1024.42};
auto result = 通过简单的调用struct_pack::serialize进行序列化<std::string>(person1);
auto person2 = struct_pack::deserialize<person>(result);
```
通过简单的调用struct_pack::serialize进行序列化。serialize中又调用了serialize_to
```
template <serialize_config conf = serialize_config{},
          detail::struct_pack_buffer Buffer, typename... Args>
void STRUCT_PACK_INLINE serialize_to(Buffer &buffer, const Args &...args) {
  static_assert(sizeof...(args) > 0);
  auto data_offset = buffer.size();
  auto info = detail::get_serialize_runtime_info<conf>(args...);
  auto total = data_offset + info.size();
  buffer.resize(total);
  auto writer =
      struct_pack::detail::memory_writer{(char *)buffer.data() + data_offset};
  struct_pack::detail::serialize_to<conf>(writer, info, args...);
}
```
这里的serialize_to主要有两个功能，1.是获取序列化信息```detail::get_serialize_runtime_info```。2是真正的序列化写入```serialize_to<conf>(writer, info, args...)```
### get_serialize_runtime_info
该函数中首先通过```calculate_payload_size```获取size_info信息，然后对size_info进行修正完善。这里size_info信息时通过visit_members获取自定义结构体的信息。visit_members函数中通过member_count_impl在编译期获取自定义结构体的成员变量个数。这里有个小技巧，聚合类 Foo满足以下所有的初始化方法:
```
struct Foo {
    int a;
    int b;
    int c;
};

int main()
{
    Foo a{1};
    //Foo a{1,2};
    //Foo a{1,2,3};
    std::cout << a.a<< a.b<< std::endl;
    return 0;
}
```
所以member_count_impl的核心思想是通过不断加参数直到构造成功，最后返回成功时的参数列表个数。
```
template <typename T, typename... Args>
consteval std::size_t member_count_impl() {
  if constexpr (requires { T{{Args{}}..., {UniversalType{}}}; } == true) {
    return member_count_impl<T, Args..., UniversalType>();
  }
  else if constexpr (requires {
                       T{{Args{}}..., {UniversalOptionalType{}}};
                     } == true) {
    return member_count_impl<T, Args..., UniversalOptionalType>();
  }
  else if constexpr (requires {
                       T{{Args{}}..., {UniversalIntegralType{}}};
                     } == true) {
    return member_count_impl<T, Args..., UniversalIntegralType>();
  }
  else if constexpr (requires {
                       T{{Args{}}..., {UniversalNullptrType{}}};
                     } == true) {
    return member_count_impl<T, Args..., UniversalNullptrType>();
  }
  else if constexpr (requires {
                       T{{Args{}}..., {UniversalCompatibleType{}}};
                     } == true) {
    return member_count_impl<T, Args..., UniversalCompatibleType>();
  }
  else {5
    return sizeof...(Args);
  }
}
```
而后通过结构化绑定将参数取出，最后通过自定义的visitor获取想要的信息,这里是获取```sizecalculate_payload_size```。```get_serialize_runtime_info```的后半部分重新更新序列化数据的信息。
### serialize_to
```serialize_metainfo```用于序列化元信息.```serialize_many```序列化数据内容详情可参考[struct_pack 的编码规则与布局](https://alibaba.github.io/yalantinglibs/zh/guide/struct-pack-layout.html)

### 反序列化
这里T是真正需要的结构体类型，通过expeted获得一个类型对象,关于expeted可以参考[expected结构体](https://alibaba.github.io/yalantinglibs/cn/html/structexpected.html)。
```
template <typename T, typename... Args, detail::deserialize_view View>
[[nodiscard]] STRUCT_PACK_INLINE auto deserialize(const View &v) {
  expected<detail::get_args_type<T, Args...>, struct_pack::errc> ret;

  if (auto errc = deserialize_to(ret.value(), v); errc != struct_pack::errc{})
      [[unlikely]] {
    ret = unexpected<struct_pack::errc>{errc};
  }
  return ret;
}
```
```deserialize_to```中通过```visit_members```递归调用```deserialize_one```。Reader.read将序列化后的数据写进expeted的对象中
```
...
else if constexpr (std::is_fundamental_v<type> || std::is_enum_v<type>) {
  if constexpr (NotSkip) {
    if (!reader_.read((char *)&item, sizeof(type))) [[unlikely]] {
      return struct_pack::errc::no_buffer_space;
    }
  }
  else {
    return reader_.ignore(sizeof(type)) ? errc{} : errc::no_buffer_space;
  }
}
...
```
## 参考
- [struct_pack简介](https://alibaba.github.io/yalantinglibs/zh/guide/struct-pack-intro.html)
- [struct_pack 的编码规则与布局](https://alibaba.github.io/yalantinglibs/zh/guide/struct-pack-layout.html)
- [struct_pack解读](https://blog.csdn.net/weixin_45620740/article/details/128357812)
- [聚和类](https://blog.csdn.net/qq_41453285/article/details/95750373)