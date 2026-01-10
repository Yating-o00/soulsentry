import { base44 } from "@/api/base44Client";

/**
 * 智能搜索引擎 - 解析自然语言查询并执行高级搜索
 */
export class SmartSearchEngine {
  /**
   * 解析自然语言查询为结构化搜索条件
   */
  static async parseQuery(query, knowledgeItems) {
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this natural language search query into structured search conditions.

Query: "${query}"

Instructions:
1. Extract main keywords and phrases
2. Identify boolean operators (AND, OR, NOT) from natural language
   - "and", "both", "also" → AND
   - "or", "either" → OR  
   - "not", "without", "exclude" → NOT
3. Detect search modes:
   - exact: exact phrase match
   - fuzzy: similar/related terms
   - semantic: meaning-based search
4. Extract filters (tags, date ranges, importance)
5. Determine result ordering preference

Examples:
- "AI and machine learning" → keywords: ["AI", "machine learning"], operator: AND
- "health or fitness tips" → keywords: ["health", "fitness tips"], operator: OR
- "work tasks not completed" → keywords: ["work tasks", "completed"], operator: NOT
- "recent notes about design" → keywords: ["design"], filters: {recent: true}

Return JSON matching schema.`,
        response_json_schema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Main search keywords/phrases"
            },
            operator: {
              type: "string",
              enum: ["AND", "OR", "NOT"],
              description: "Boolean logic operator"
            },
            searchMode: {
              type: "string",
              enum: ["exact", "fuzzy", "semantic"],
              description: "Search matching mode"
            },
            filters: {
              type: "object",
              properties: {
                tags: { type: "array", items: { type: "string" } },
                recent: { type: "boolean" },
                importance: { type: "number" },
                sourceType: { type: "string" }
              }
            },
            orderBy: {
              type: "string",
              enum: ["relevance", "date", "access_count", "importance"],
              description: "Preferred result ordering"
            }
          },
          required: ["keywords", "operator", "searchMode"]
        }
      });

      return response;
    } catch (error) {
      console.error("查询解析失败:", error);
      // 降级到简单关键词搜索
      return {
        keywords: [query],
        operator: "OR",
        searchMode: "fuzzy",
        orderBy: "relevance"
      };
    }
  }

  /**
   * 执行智能搜索
   */
  static async search(query, knowledgeItems, userPreferences = {}) {
    // 解析查询
    const parsedQuery = await this.parseQuery(query, knowledgeItems);
    
    // 执行搜索
    let results = this.filterItems(knowledgeItems, parsedQuery);
    
    // 计算相关度分数
    results = this.calculateRelevance(results, parsedQuery, query);
    
    // 个性化排序
    results = this.personalizedSort(results, parsedQuery, userPreferences);
    
    return {
      results,
      parsedQuery,
      totalCount: results.length
    };
  }

  /**
   * 根据解析条件过滤知识条目
   */
  static filterItems(items, parsedQuery) {
    const { keywords, operator, searchMode, filters } = parsedQuery;

    return items.filter(item => {
      // 应用过滤器
      if (filters) {
        if (filters.tags?.length > 0) {
          const hasTag = filters.tags.some(tag => 
            item.tags?.some(t => t.toLowerCase().includes(tag.toLowerCase()))
          );
          if (!hasTag) return false;
        }

        if (filters.recent) {
          const dayAgo = new Date();
          dayAgo.setDate(dayAgo.getDate() - 1);
          if (new Date(item.created_date) < dayAgo) return false;
        }

        if (filters.sourceType && item.source_type !== filters.sourceType) {
          return false;
        }
      }

      // 关键词匹配
      const searchText = `${item.title} ${item.content} ${item.summary || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      
      const matches = keywords.map(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        
        switch (searchMode) {
          case "exact":
            return searchText.includes(lowerKeyword);
          case "fuzzy":
            // 模糊匹配 - 允许部分匹配
            return this.fuzzyMatch(searchText, lowerKeyword);
          case "semantic":
            // 语义匹配 - 检查相关词
            return this.semanticMatch(searchText, lowerKeyword);
          default:
            return searchText.includes(lowerKeyword);
        }
      });

      // 应用布尔逻辑
      switch (operator) {
        case "AND":
          return matches.every(m => m);
        case "OR":
          return matches.some(m => m);
        case "NOT":
          // 第一个关键词必须匹配，其余的必须不匹配
          return matches[0] && !matches.slice(1).some(m => m);
        default:
          return matches.some(m => m);
      }
    });
  }

  /**
   * 模糊匹配算法
   */
  static fuzzyMatch(text, keyword) {
    // 简单的模糊匹配：检查每个词是否部分出现
    const words = keyword.split(/\s+/);
    return words.some(word => text.includes(word.toLowerCase()));
  }

  /**
   * 语义匹配（简化版）
   */
  static semanticMatch(text, keyword) {
    // 简化的语义匹配：检查同义词和相关词
    const synonyms = {
      'ai': ['人工智能', 'artificial intelligence', 'machine learning', '机器学习'],
      'work': ['工作', 'job', 'task', '任务', 'project', '项目'],
      'health': ['健康', 'fitness', '健身', 'wellness', '养生'],
      'learn': ['学习', 'study', '研究', 'education', '教育'],
    };

    const lowerKeyword = keyword.toLowerCase();
    const relatedTerms = synonyms[lowerKeyword] || [];
    
    return text.includes(lowerKeyword) || 
           relatedTerms.some(term => text.includes(term.toLowerCase()));
  }

  /**
   * 计算相关度分数
   */
  static calculateRelevance(items, parsedQuery, originalQuery) {
    const lowerQuery = originalQuery.toLowerCase();
    
    return items.map(item => {
      let score = 0;
      const searchText = `${item.title} ${item.content} ${item.summary || ''}`.toLowerCase();

      // 标题匹配权重最高
      if (item.title.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      // 摘要匹配
      if (item.summary?.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // 内容匹配
      const contentMatches = (searchText.match(new RegExp(lowerQuery, 'gi')) || []).length;
      score += contentMatches * 2;

      // 标签匹配
      const tagMatches = (item.tags || []).filter(tag => 
        tag.toLowerCase().includes(lowerQuery)
      ).length;
      score += tagMatches * 3;

      // 关键词匹配
      parsedQuery.keywords.forEach(keyword => {
        const keywordMatches = (searchText.match(new RegExp(keyword.toLowerCase(), 'gi')) || []).length;
        score += keywordMatches;
      });

      return { ...item, relevanceScore: score };
    });
  }

  /**
   * 个性化排序
   */
  static personalizedSort(items, parsedQuery, userPreferences) {
    return items.sort((a, b) => {
      // 优先按照解析出的排序偏好
      switch (parsedQuery.orderBy) {
        case "relevance":
          return b.relevanceScore - a.relevanceScore;
        
        case "date":
          return new Date(b.created_date) - new Date(a.created_date);
        
        case "access_count":
          return (b.access_count || 0) - (a.access_count || 0);
        
        case "importance":
          return (b.importance || 0) - (a.importance || 0);
        
        default:
          // 综合排序算法
          const scoreA = this.calculateFinalScore(a, userPreferences);
          const scoreB = this.calculateFinalScore(b, userPreferences);
          return scoreB - scoreA;
      }
    });
  }

  /**
   * 计算最终综合分数（考虑用户偏好）
   */
  static calculateFinalScore(item, userPreferences) {
    let score = item.relevanceScore || 0;

    // 访问频率加权
    const accessWeight = userPreferences.favorFrequentlyAccessed ? 2 : 1;
    score += (item.access_count || 0) * accessWeight;

    // 最近访问加权
    if (item.last_accessed && userPreferences.favorRecent) {
      const daysSinceAccess = (Date.now() - new Date(item.last_accessed)) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 10 - daysSinceAccess);
    }

    // 重要性加权
    score += (item.importance || 0) * 5;

    // 新鲜度加权
    const daysSinceCreation = (Date.now() - new Date(item.created_date)) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 7) {
      score += 5; // 最近7天创建的内容加分
    }

    // 用户偏好标签加权
    if (userPreferences.favoriteTags?.length > 0 && item.tags) {
      const matchingTags = item.tags.filter(tag => 
        userPreferences.favoriteTags.includes(tag)
      ).length;
      score += matchingTags * 3;
    }

    return score;
  }

  /**
   * 记录搜索行为（用于学习用户偏好）
   */
  static async recordSearchBehavior(query, selectedItemId, userId) {
    try {
      // 这里可以记录到UserBehavior实体或专门的搜索日志
      // 用于后续分析用户偏好
      await base44.entities.UserBehavior.create({
        event_type: "search_query",
        metadata: {
          query,
          selectedItemId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("记录搜索行为失败:", error);
    }
  }

  /**
   * 获取用户搜索偏好
   */
  static async getUserPreferences(userId) {
    try {
      const behaviors = await base44.entities.UserBehavior.filter({
        event_type: "search_query"
      });

      // 分析行为数据，提取偏好
      const preferences = {
        favorFrequentlyAccessed: true,
        favorRecent: true,
        favoriteTags: this.extractFavoriteTags(behaviors)
      };

      return preferences;
    } catch (error) {
      console.error("获取用户偏好失败:", error);
      return {
        favorFrequentlyAccessed: false,
        favorRecent: false,
        favoriteTags: []
      };
    }
  }

  /**
   * 从行为数据中提取常用标签
   */
  static extractFavoriteTags(behaviors) {
    const tagCounts = {};
    
    behaviors.forEach(b => {
      if (b.metadata?.tags) {
        b.metadata.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // 返回出现最多的前5个标签
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }
}