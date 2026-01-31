[TOC]

# 870. 优势洗牌

## 介绍
给定两个大小相等的数组 nums1 和 nums2，nums1 相对于 nums 的优势可以用满足 nums1[i] > nums2[i] 的索引 i 的数目来描述。

返回 nums1 的任意排列，使其相对于 nums2 的优势最大化。

 

示例 1：

输入：nums1 = [2,7,11,15], nums2 = [1,10,4,11]
输出：[2,11,7,15]
示例 2：

输入：nums1 = [12,24,8,32], nums2 = [13,25,32,11]
输出：[24,32,8,12]

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/advantage-shuffle
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from typing import List
import copy

class Solution:
    def advantageCount(self, nums1: List[int], nums2: List[int]) -> List[int]:
        nums1.sort(reverse=True)
        nums2 = sorted(enumerate(nums2), key=lambda x: x[1],reverse=True)
        tmp = []
        first = 0
        last = len(nums1) - 1
        for pos, num in nums2:
            if nums1[first] > num:
                tmp += [nums1[first]]
                first += 1
            else:
                tmp += [nums1[last]]
                last -= 1
        result = [0] * len(nums2)
        idx = 0
        for i,_ in nums2:
            result[i] = tmp[idx]
            idx += 1
        return result



if __name__ == "__main__":
    nums1 = [12,24,8,32]
    nums2 = [13,25,32,11]

    s = Solution()
    print(s.advantageCount(nums1, nums2))
```