[TOC]

# 类型擦除
实现一个function executor，支持任意类型的函数调用，比如以下。要实现这一功能，我们需要使用类型擦除技术。类型擦除允许我们在不暴露具体类型的情况下存储和调用不同类型的函数。
```C++
void test1()
int test2(int a, double b)
std::string test3(const std::string& s, int& x, double& y)
void test4(int a)
class TestClass
{
public:
    int memberFunc(int a)
    {
        return a;
    }
    std::string memberFunc(const std::string& str)
    {
        return str;
    }
};

funexecutor::FunExecutor executor;
executor.RegisterFunction("test1", test1);
executor.InvokeFunction<void>("test1");

executor.RegisterFunction("test2", test2);
CHECK(13 == *executor.InvokeFunction<int>("test2", 10, 3.14));

executor.RegisterFunction("test3", test3);
CHECK("hello world" == *executor.InvokeFunction<std::string>("test3", std::string("hello"), 10, 2.71));

executor.RegisterFunction("test4", test4);
executor.InvokeFunction<void>("test4", 42);

TestClass obj;
executor.RegisterFunction("memberFunc", [&obj](int a) {return obj.memberFunc(a);});
CHECK(99 == *executor.InvokeFunction<int>("memberFunc", 99));
```

## 入参的类型擦除
std::apply+std::tuple可以实现对任意类型的函数调用。我们可以将函数的参数打包成一个tuple，然后使用std::apply来调用函数。这样，我们就可以在不知道具体参数类型的情况下，调用任意类型的函数。
```C++
auto func = [](int x, int y){ return x + y; };
auto result = std::apply(func, std::make_tuple(3, 4));
```

但这样并不能实现通用的function executor, function executor应该需要先注册函数，然后在调用时根据函数名和参数类型来调用对应的函数。比如存进std::map<string, function>。但是function的返回值和入参都不一样,改造一下`function = std::function<std::any(const TupleWrapper& params)>`。`TupleWrapper`使用`std::any`来存储任意类型的`std::tuple`，invoke时因为`RegisterFunction`已经拿到函数元数据，所以可以使用`std::any_cast`来获取对应类型的tuple。
```C++
class TupleWrapper
{
public:
    template <typename... Args>
    TupleWrapper(Args&&... args)
        : data_(std::make_any<std::tuple<typename stored_arg<Args>::type...>>(
              std::forward<Args>(args)...))
    { }

    template <typename ExpectedTuple>
    const ExpectedTuple& GetTuple() const
    {
        try
        {
            return std::any_cast<const ExpectedTuple&>(data_);
        } catch (const std::bad_any_cast&)
        {
            throw std::runtime_error("Type mismatch when accessing tuple");
        }
    }

private:
    std::any data_;
};

template <typename Function>
void RegisterFunction(const std::string& name, Function&& func)
{
    using traits
        = function_traits::v1::function_traits<std::decay_t<Function>>;
    using args_tuple  = typename traits::tuple_type;
    using return_type = typename traits::return_type;

    functions_[name] = [func = std::forward<Function>(func)](
                            TupleWrapper params) -> std::any {
        auto args = params.GetTuple<args_tuple>();

        if constexpr (std::is_void_v<return_type>)
        {
            std::apply(func, args);
            return std::any{};
        }
        else
        {
            auto result = std::apply(func, args);
            return std::any{std::move(result)};
        }
    };
}

template <typename R, typename... Args>
auto InvokeFunction(const std::string& name, Args&&... args)
{
    using ReturnType
        = std::conditional_t<std::is_void_v<R>, std::monostate, R>;
    using OptionalReturnType = std::optional<ReturnType>;

    auto it = functions_.find(name);
    if (it == functions_.end())
    {
        return OptionalReturnType{std::nullopt};
    }

    std::any result_any
        = it->second(TupleWrapper(std::forward<Args>(args)...));

    if constexpr (std::is_void_v<R>)
    {
        return OptionalReturnType{std::monostate{}};
    }
    else
    {
        try
        {
            R value = std::any_cast<R>(result_any);
            return OptionalReturnType{std::move(value)};
        } catch (const std::bad_any_cast&)
        {
            return OptionalReturnType{std::nullopt};
        }
    }
}
```

## 返回值的类型擦除
可以看到，目前实现了入参的类型擦除，调用方法类似`executor.InvokeFunction<int>("memberFunc", 99)`，仍然需要指定返回值类型。如果是开发通信中间件，使用这种function executor还是不方便。想象一下如果网络上来了一个包，怎么样才能直接调用某种方法，而无需知晓参数和返回值的类型？如果约定入参和出参都是json格式，那么就直接可以使用json来做类型擦除。但更多的情况下，入参和出参都是自定义类型，这时候就需要使用序列化来实现类型擦除。ros2中的序列化是通过python在编译期创建新序列化文件或者类型元文件，实现对任意类型的消息进行序列化和反序列化，而不需要知道具体的类型信息。比如我们定义了一个msg消息,SaveFile.msg：
```C++
int32 resolution_width                  # 分辨率,录像暂不支持修改分辨率
int32 resolution_height                 # 分辨率,录像暂不支持修改分辨率
string file_dir                         # 文件路径
string file_name                           # 图片或录像格式，目前图片只支持JPG，录像只支持mp4
```

### fastdds
python直接为每一个结构体生成序列化/反序列化方法：
```C++
bool
ROSIDL_TYPESUPPORT_FASTRTPS_CPP_PUBLIC_camera_msgs
cdr_serialize(
  const camera_msgs::msg::SaveFile & ros_message,
  eprosima::fastcdr::Cdr & cdr)
{
  // Member: resolution_width
  cdr << ros_message.resolution_width;

  // Member: resolution_height
  cdr << ros_message.resolution_height;

  // Member: file_dir
  cdr << ros_message.file_dir;

  // Member: file_name
  cdr << ros_message.file_name;

  return true;
}

bool
ROSIDL_TYPESUPPORT_FASTRTPS_CPP_PUBLIC_camera_msgs
cdr_deserialize(
  eprosima::fastcdr::Cdr & cdr,
  camera_msgs::msg::SaveFile & ros_message)
{
  // Member: resolution_width
  cdr >> ros_message.resolution_width;

  // Member: resolution_height
  cdr >> ros_message.resolution_height;

  // Member: file_dir
  cdr >> ros_message.file_dir;

  // Member: file_name
  cdr >> ros_message.file_name;

  return true;
}
```

至于基础类型的序列化反序列化方法，都在非生成的头文件中实现了。

### cyclonedds
python为每个自定义类型生成一个核心结构体，然后使用通用方法来实现序列化/反序列化功能：
```C++
  static const ::rosidl_typesupport_introspection_cpp::MessageMembers SaveFile_message_members = {
    "camera_msgs::msg",  // message namespace
    "SaveFile",  // message name
    4,  // number of fields
    sizeof(camera_msgs::msg::SaveFile),
    false,  // has_any_key_member_
    SaveFile_message_member_array,  // message members
    SaveFile_init_function,  // function to initialize message memory (memory has to be allocated)
    SaveFile_fini_function  // function to terminate message instance (will not free memory)
  };
```

这里的`SaveFile_message_member_array`定义如下：
```c++
  static const ::rosidl_typesupport_introspection_cpp::MessageMember SaveFile_message_member_array[4] = {
    {
      "resolution_width",  // name
      ::rosidl_typesupport_introspection_cpp::ROS_TYPE_INT32,  // type
      0,  // upper bound of string
      nullptr,  // members of sub message
      false,  // is key
      false,  // is array
      0,  // array size
      false,  // is upper bound
      offsetof(camera_msgs::msg::SaveFile, resolution_width),  // bytes offset in struct
      nullptr,  // default value
      nullptr,  // size() function pointer
      nullptr,  // get_const(index) function pointer
      nullptr,  // get(index) function pointer
      nullptr,  // fetch(index, &value) function pointer
      nullptr,  // assign(index, value) function pointer
      nullptr  // resize(index) function pointer
    },
    {
      "resolution_height",  // name
      ...
    },
    {
      "file_dir",  // name
      ::rosidl_typesupport_introspection_cpp::ROS_TYPE_STRING,  // type
      0,  // upper bound of string
      nullptr,  // members of sub message
      false,  // is key
      false,  // is array
      0,  // array size
      false,  // is upper bound
      offsetof(camera_msgs::msg::SaveFile, file_dir),  // bytes offset in struct
      nullptr,  // default value
      nullptr,  // size() function pointer
      nullptr,  // get_const(index) function pointer
      nullptr,  // get(index) function pointer
      nullptr,  // fetch(index, &value) function pointer
      nullptr,  // assign(index, value) function pointer
      nullptr  // resize(index) function pointer
    },
    {
      "file_name",  // name
      ::rosidl_typesupport_introspection_cpp::ROS_TYPE_STRING,  // type
      ...
    }
  };
```

核心是`offsetof(camera_msgs::msg::SaveFile, resolution_width)`，这个宏可以获取结构体中成员变量的偏移量。通过这个偏移量就可以获取到结构体中成员变量的地址，从而实现序列化和反序列化。类似这样：
```C++
void generic_serialize(void* raw_message_memory, MessageMembers* members, Cdr& cdr) {
    // 1. 获取字段数组
    for (int i = 0; i < members->member_count_; i++) {
        MessageMember* member = &members->members_[i];
        // 2. 计算该字段在内存中的真实地址
        void* field_ptr = (char*)raw_message_memory + member->offset_;
        
        // 3. 根据类型标签，决定如何写入 CDR 流
        switch (member->type_id_) {
            case ROS_TYPE_INT32:
                cdr << *(int32_t*)field_ptr;  // 直接读内存并写入
                break;
            case ROS_TYPE_STRING:
                // 因为 string 在内存中是个对象，需要调用其 c_str() 和 size()
                std::string* str_ptr = (std::string*)field_ptr;
                cdr << str_ptr->size();
                cdr.write_serialized_data(str_ptr->c_str(), str_ptr->size());
                break;
            case ROS_TYPE_MESSAGE:  // 嵌套子消息
                // 递归！获取子消息的 MessageMembers，再次调用本函数
                MessageMembers* sub_members = get_members(member->sub_type);
                generic_serialize(field_ptr, sub_members, cdr);
                break;
            // ... 处理数组、序列等
        }
    }
}
```

### 其他的序列化方法
虽然fastdds和cyclonedds提供的序列化方法都属于非侵入式的，但都需要python辅助，在编译期生成序列化代码。如果是侵入式的序列化方法，我们可以这么实现：
```C++
#define GEN_SERIALIZE(...)                         \
    char* Serialize(char* buf) const               \
    {                                              \
        return SerializeImpl(buf, __VA_ARGS__);    \
    }                                              \
    std::string Serialize() const                  \
    {                                              \
        std::string s(CalculateSize(), '\0');      \
        SerializeImpl(s.data(), __VA_ARGS__);      \
        return s;                                  \
    }                                              \
    uint16_t Deserialize(const char* buf)          \
    {                                              \
        uint16_t offset;                           \
        DeserializeImpl(buf, offset, __VA_ARGS__); \
        return offset;                             \
    }                                              \
    uint16_t CalculateSize() const                 \
    {                                              \
        return CalculateSizeImpl(__VA_ARGS__);     \
    }

struct BaseNew
{
    int index;
    std::string str;
    std::vector<int> v;
    std::set<int> st;
    char c[3];
    UUID t;
    GEN_SERIALIZE(index, str, v, st, c, t)
};

struct TestNew
{
    BaseNew base;
    std::string s;
    GEN_SERIALIZE(base, str)
};
```

`DeserializeImpl`和`SerializeImpl`是模板函数，具体实现对不同类型参数的序列化和反序列化方法，最终输出一串紧凑型字节流或从字节流中恢复数据。详细实现参考[simple_serialize](https://github.com/BestUO/littletools/blob/bb1dfb0d0c3244b45ba64f369bd28f3a94d23ffd/tools/simple_serialize.hpp),`simple_serialize`的实现思路和fastdds相似，都是在结构体内部生成一个序列化反序列化方法。如果是非侵入式的序列化方法，我们可以使用编译期反射来实现，参考[struct_pack](https://www.aiecent.com/post.html?id=14)。最终我们可以这样调用function executor：
```C++
std::string RecvAndResponse(char* recv_buf, size_t recv_size)
{
    std::string_view recv_view(recv_buf, recv_size);
    auto func_name = DeserializeFuncName(recv_view);//只反序列化函数名
    return executor_.InvokeFunctionWithSerialize(func_name, recv_view);
}
```

核心处理函数无需知道具体的函数参数和返回值类型，只需要知道函数名和接收的序列化字节流，就可以调用对应的函数并返回序列化后的结果。这种方式可以实现对任意类型函数的注册和调用，极大地提高了系统的灵活性和可扩展性，在RPC框架和中间件开发中非常有用。