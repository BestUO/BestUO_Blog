# tuple和可变参数模板互相转换

### TupleToArgs

思路：通过tuple_size获得tuple大小N，然后生成0,1,2,3...N的序列递归展开tuple。

```C++
//c++11需要自己写模板生成0,1,2,3...N序列
template <int...>
struct IndexTuple {};

template <int N, int...Indexs>
struct MakeIndexes : MakeIndexes<N - 1, N - 1, Indexs...>{};

template <int...Indexs>
struct MakeIndexes<0, Indexs...>
{
  typedef IndexTuple<Indexs...> type;
};

template <typename Tuple, int...Indexs>
void Transform(IndexTuple<Indexs...>&& in, Tuple&& tp)
{
  (std::cout << ... << std::get<Indexs>(tp)) << std::endl;
}

void testtupletoargs()
{
   auto tp = std::make_tuple(1, 2,"dfgd");
   Transform(MakeIndexes<std::tuple_size<decltype(tp)>::value>::type(), tp);
}

//c++14可以使用std::make_index_sequence生成序列
template <size_t... Indexs, typename Tuple>
void Transform(std::index_sequence<Indexs...>&& in, Tuple&& tp)
{
  (std::cout << ... << std::get<Indexs>(tp)) << std::endl;
}

void testtupletoargs()
{
  auto tp = std::make_tuple(1, 2,"dfgd");
  Transform(std::make_index_sequence<std::tuple_size<decltype(tp)>::value>(), tp);
}

```


### ArgsToTuple

```C++
std::tuple<int,int,int,int> t= std::forward_as_tuple(1,2,3,4);
std::cout << std::get<2>(t) << std::endl;

template<typename... Args>
decltype(auto) ArgsToTuple(Args... args)
{
    return std::tuple<Args...>(args...);
}
auto [x,y,z] = ArgsToTuple(1,2,"123");
std::cout << x << y << z << std::endl;

```


