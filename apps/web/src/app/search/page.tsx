import { SearchResultsClient } from '@/app/search/search-results-client';

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const queryParam = params?.q;
  const initialQuery = Array.isArray(queryParam) ? (queryParam[0] ?? '') : (queryParam ?? '');

  return <SearchResultsClient initialQuery={initialQuery} />;
}
