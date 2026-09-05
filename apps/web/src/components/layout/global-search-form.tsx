'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { SearchInput } from '@/components/ui/search-input';

type GlobalSearchFormProps = {
  className?: string;
  initialQuery?: string;
  inputClassName?: string;
  onSearch?: () => void;
};

export function GlobalSearchForm({
  className,
  initialQuery = '',
  inputClassName,
  onSearch,
}: GlobalSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = query.trim();

    if (!nextQuery) {
      return;
    }

    onSearch?.();
    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
  }

  return (
    <form action="/search" className={className} onSubmit={handleSubmit} role="search">
      <SearchInput
        aria-label="Search HiveLore"
        className={inputClassName}
        name="q"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search worlds and lore"
        value={query}
      />
    </form>
  );
}
