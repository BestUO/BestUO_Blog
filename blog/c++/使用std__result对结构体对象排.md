# 使用std::result对结构体对象排序

原文链接：[https://www.cnblogs.com/qicosmos/p/3286057.html](https://www.cnblogs.com/qicosmos/p/3286057.html)

struct Person{ string name; int age; string city;};
vector<Person> vt = {{"aa", 20, "shanghai"},{"bb", 25, "beijing"},{"cc", 25, "nanjing"},{"dd", 20, "nanjing"}};
需求对vt 进行groupby 排序

分别以int和string为key排序：

```C++
multimap<int, Person> GroupByAge(const vector<Person>& vt)
{
multimap<int, Person> map;
std::for_each(vt.begin(), vt.end(), [&map](const Person& person)
{
map.insert(make_pair(person.age, person));
});

return map;
}
```


```C++
multimap<string, Person> GroupByName(const vector<Person>& vt)
{
multimap<string, Person> map;
std::for_each(vt.begin(), vt.end(), [&map](const Person& person)
{
map.insert(make_pair(person.name, person));
});

return map;
}
```


代码重复，做一下改变：

```C++
template<typename T>
multimap<T, Person> GroupBy(const vector<Person>& vt)
{
multimap<T, Person> map;
std::for_each(vt.begin(), vt.end(), [&map](const Person& person)
{
map.insert(make_pair(person.name, person)); //不行了，这个地方不能选择键值了
});

return map;
}
```


通过闭包擦除类型：

```C++
template<typename T> 
multimap<T, Person> GroupBy(const vector<Person>& vt, const Fn& keySlector)
{
multimap<T, Person> map;
std::for_each(vt.begin(), vt.end(), [&map](const Person& person)
{
map.insert(make_pair(keySlector(person), person)); //keySlector返回值就是键值，通过keySelector擦除了类型
}); return map;
}

void TestGroupBy()
{
vector<Person> vt{...};
//按年龄分组
GroupBy<int>(vt, [](const Person& person){return person.age;});
//按年龄分组
GroupBy<string>(vt, [](const Person& person){return person.name;});
//按年龄分组
GroupBy<string>(vt, [](const Person& person){return person.city;});
}

```


GroupBy<int>(vt, [](const Person& person){return person.age;});int类型与闭包返回值类型一致，道理上可以自动推导：

```C++
template<typename R, typename Fn>
multimap<typename std::result_of<Fn(value_type)>::type, value_type> groupby(R v, const Fn& f)  //decltype(f(*((value_type*)0))),f((value_type&)nullptr)
{
typedef typename R::value_type value_type;
//typedef typename std::result_of<Fn(value_type)>::type ketype;
typedef  decltype(std::declval<Fn>()(std::declval <value_type>())) ketype;
//typedef decltype(f(value_type())) ketype;
multimap<ketype, value_type> mymap;
std::for_each(begin(v), end(v), [&mymap, &f](value_type item)
{
mymap.insert(make_pair(f(item), item));
});
return mymap;
}

vector<Person> vt = { {"aa", 20, "shanghai"}, { "bb", 25, "beijing" }, { "cc", 25, "nanjing" }, { "dd", 20, "nanjing" } };
Range <vector<Person>> range(vt);
auto r1 = groupby(vt, [](const Person& person){return person.age; });
auto r2 = groupby(vt, [](const Person& person){return person.name; });
auto r3 = groupby(vt, [](const Person& person){return person.city; });

```


再一个例子：

```
template <typename T>
T* GetFunction(const string& funcName)
{
    auto addr = GetProcAddress(m_hMod, funcName.c_str());
    return (T*) (addr);
}

template <typename T, typename... Args>
typename std::result_of<std::function<T>(Args...)>::type ExcecuteFunc(const string& funcName, Args&&... args)
{
    auto f = GetFunction<T>(funcName);
    if (f == nullptr)
    {
        string s = "can not find this function " + funcName;
        throw std::exception(s.c_str());
    }            

    return f(std::forward<Args>(args)...);
}

ExcecuteFunc<int(int, int)>("Max", 5, 8);

```


