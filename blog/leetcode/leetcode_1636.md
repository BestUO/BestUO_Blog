[TOC]

# 1636-按照频率将数组升序排序

## 介绍
给你一个整数数组 nums ，请你将数组按照每个值的频率 升序 排序。如果有多个值的频率相同，请你按照数值本身将它们 降序 排序。 

请你返回排序后的数组。

 

示例 1：

输入：nums = [1,1,2,2,2,3]
输出：[3,1,1,2,2,2]
解释：'3' 频率为 1，'1' 频率为 2，'2' 频率为 3 。
示例 2：

输入：nums = [2,3,1,3,2]
输出：[1,3,3,2,2]
解释：'2' 和 '3' 频率都为 2 ，所以它们之间按照数值本身降序排序。
示例 3：

输入：nums = [-1,1,-6,4,5,-6,1,4,1]
输出：[5,-1,4,4,-6,-6,1,1,1]

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/sort-array-by-increasing-frequency
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```c++
#include <vector>
#include <map>
#include <iostream>
#include<algorithm>

class Solution {
public:
    std::vector<int> frequencySort(std::vector<int>& nums) 
    {
        std::map<int,unsigned int> tmp;
        for(auto num:nums)
            tmp[num] += 1;

        std::sort(nums.begin(),nums.end(),[&](const int& d1, const int& d2)
        {
            if(tmp[d1] == tmp[d2])
                return d1 > d2;
            else
                return tmp[d1] < tmp[d2];
        });

        return nums;
    }
};

int main()
{
    std::vector<int> nums{1,1,2,2,2,3};
    Solution tmp;
    auto v = tmp.frequencySort(nums);
    for(auto i:v)
        std::cout << i << std::endl;
    return 0;
}
```

```python
from typing import List

class Solution:
    def frequencySort(self, nums: List[int]) -> List[int]:
        sorted(nums, key = lambda n: (nums.count(n), -n) )

if __name__ == "__main__":
    nums = [1,1,2,2,2,3]
    s = Solution()
    print(s.frequencySort(nums))
```