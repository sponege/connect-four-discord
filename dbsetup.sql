alter user 'root'@'localhost' identified by 'password';
create database vc;
use vc;

create table mutes (
  user_id bigint primary key,
  ts bigint
);
