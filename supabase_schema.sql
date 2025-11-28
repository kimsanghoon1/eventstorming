-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create folders table
create table folders (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  parent_id uuid references folders(id) on delete cascade,
  owner_id uuid references auth.users(id) not null default auth.uid(),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create boards table
create table boards (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  folder_id uuid references folders(id) on delete cascade,
  board_type text not null check (board_type in ('Eventstorming', 'UML')),
  content jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  owner_id uuid references auth.users(id) not null default auth.uid(),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table folders enable row level security;
alter table boards enable row level security;

-- RLS Policies for Folders
create policy "Users can view their own folders"
  on folders for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own folders"
  on folders for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own folders"
  on folders for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own folders"
  on folders for delete
  using (auth.uid() = owner_id);

-- RLS Policies for Boards
create policy "Users can view their own boards"
  on boards for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own boards"
  on boards for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own boards"
  on boards for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own boards"
  on boards for delete
  using (auth.uid() = owner_id);
