alter user 'root'@'localhost' identified by 'password';
create database troll;
use troll;

create table troll (
  user_id bigint primary key,
  emoji bigint
);
