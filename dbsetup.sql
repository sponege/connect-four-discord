alter user 'root'@'localhost' identified by 'password';
create database connect4;
use connect4;

create table users (
  user_id bigint primary key,
  moves int
);

create table blacklist (
  user_id bigint primary key
);

create table wins (
  red int,
  blue int
);

create table moves (
  round_number int,
  move_number int,
  column_number int,
  color boolean,
  user_id bigint,
  ts bigint
);

create table state (
  msg_id bigint,
  round_number int,
  move_number int,
  whose_turn boolean
);

