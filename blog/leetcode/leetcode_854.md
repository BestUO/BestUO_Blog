[TOC]

# 854-相似度为 K 的字符串

## 介绍
对于某些非负整数 k ，如果交换 s1 中两个字母的位置恰好 k 次，能够使结果字符串等于 s2 ，则认为字符串 s1 和 s2 的 相似度为 k 。

给你两个字母异位词 s1 和 s2 ，返回 s1 和 s2 的相似度 k 的最小值。

 

示例 1：

输入：s1 = "ab", s2 = "ba"
输出：1
示例 2：

输入：s1 = "abc", s2 = "bca"
输出：2

来源：力扣（LeetCode）
链接：https://leetcode.cn/problems/k-similar-strings
著作权归领扣网络所有。商业转载请联系官方授权，非商业转载请注明出处。

## 实现
```python
from functools import lru_cache

class Solution:
    @lru_cache(None)
    def kSimilarity(self, s1: str, s2: str) -> int:
        if not s1 or s1 == s2:
            return 0
        # 从s2变到s1
        cur = [i for i in range(len(s1)) if s1[i] != s2[i]]                                 #去重
        candidates = [idx for idx, i in enumerate(cur) if s2[i] == s1[cur[0]]]              #s2中可选择的位置
        ans, nxt = float('inf'), "".join([s1[i] for i in cur[1:]])                          #变换成功后的下一个s1
        for c in candidates:
            cur[0], cur[c] = cur[c], cur[0]
            ans = min(ans, self.kSimilarity(nxt, "".join(s2[i] for i in cur[1:])))          #选择最小距离
            cur[0], cur[c] = cur[c], cur[0]                                                 #换回来，为下一个选项做准备
        return ans + 1

if __name__ == "__main__":
    s1 = "aabbccddee"
    s2 = "dcacbedbae"

    s = Solution()
    print(s.kSimilarity(s1, s2))
```