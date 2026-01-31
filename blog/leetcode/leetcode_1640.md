[TOC]

# 1640. 能否连接形成数组

## 介绍
给你一个整数数组 arr ，数组中的每个整数 互不相同 。另有一个由整数数组构成的数组 pieces，其中的整数也 互不相同 。请你以 任意顺序 连接 pieces 中的数组以形成 arr 。但是，不允许 对每个数组 pieces[i] 中的整数重新排序。

如果可以连接 pieces 中的数组形成 arr ，返回 true ；否则，返回 false 。

 

示例 1：

输入：arr = [15,88], pieces = [[88],[15]]
输出：true
解释：依次连接 [15] 和 [88]
示例 2：

输入：arr = [49,18,16], pieces = [[16,18,49]]
输出：false
解释：即便数字相符，也不能重新排列 pieces[0]
示例 3：

输入：arr = [91,4,64,78], pieces = [[78],[4,64],[91]]
输出：true
解释：依次连接 [91]、[4,64] 和 [78]

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/check-array-formation-through-concatenation
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from typing import List

class Solution:
    def canFormArray(self, arr: List[int], pieces: List[List[int]]) -> bool:
        dickpieces = {}
        for piece in pieces:
            dickpieces[piece[0]] = piece

        index = 0
        while index < (len(arr)):
            piece = dickpieces.get(arr[index])
            if(not piece):
                return False
            tmp = arr[index:index+len(piece)]
            if(tmp != piece):
                return False
            index += len(piece)
        return True

if __name__ == "__main__":
    arr = [91,4,64,78]
    pieces = [[78],[4,64],[91]]
    s = Solution()
    print(s.canFormArray(arr, pieces))
```