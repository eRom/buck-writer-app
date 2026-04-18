import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery } from '@/hooks/use-mcp';
import { SearchBar } from '@/components/search/search-bar';
import { SearchResults, type SearchResult } from '@/components/search/search-results';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const Route = createFileRoute('/search')({ component: SearchPage });

interface SearchResponse {
  results?: SearchResult[];
  message?: string;
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'fulltext' | 'semantic'>('fulltext');
  const tool = mode === 'fulltext' ? 'search_fulltext' : 'search_semantic';
  const { data } = useMcpQuery<SearchResponse>(tool, { query }, { enabled: query.length >= 2 });

  const list: SearchResult[] = data?.results ?? [];

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Recherche</h1>
      <SearchBar value={query} onChange={setQuery} />
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'fulltext' | 'semantic')}>
        <TabsList>
          <TabsTrigger value="fulltext">Full-text</TabsTrigger>
          <TabsTrigger value="semantic">Sémantique</TabsTrigger>
        </TabsList>
        <TabsContent value="fulltext" className="mt-4">
          {query.length >= 2 && <SearchResults results={list} />}
        </TabsContent>
        <TabsContent value="semantic" className="mt-4">
          {query.length >= 2 && <SearchResults results={list} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
