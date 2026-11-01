#include <cassert>
#include <cstring>
#include <iostream>
#include <string>
#include "save_manager.h"
#include "variable_manager.h"
GameWorldState world;
bool restore_allowed=true;
bool capture(GameWorldState& value){value=world;return true;}
bool restore(const GameWorldState& value){if(!restore_allowed)return false;world=value;return true;}
int main(){
 VariableDefinition definitions[]={{"coins",VariableType::number,0,false,""},{"flag",VariableType::boolean,0,false,""},{"name",VariableType::string,0,false,"initial"}};
 auto& variables=VariableManager::instance();variables.initialize(definitions,3);
 auto& save=SaveManager::instance();save.game_hooks={capture,restore};
 std::string text(200,'x');text+=" player";
 variables.set_number("coins",50);variables.set_boolean("flag",true);variables.set_string("name",text.c_str());
 world.scene=7;world.camera_x=12;world.actors_count=1;world.actors[0].x=40;world.actors[0].y=96;world.actors[0].frame=512;
 assert(!save.has_game(0)&&!save.load_game(0));assert(save.save_game(0,123,55)&&save.has_game(0));
 variables.set_number("coins",99);variables.set_boolean("flag",false);variables.set_string("name","changed");world.scene=99;
 assert(save.load_game(0));assert(world.scene==7&&world.camera_x==12&&world.actors[0].frame==512);
 assert(variables.get_number("coins")==50&&variables.get_boolean("flag")&&std::strcmp(variables.get_string("name"),text.c_str())==0);
 assert(save.last_operation==2&&save.loaded_save_point==123&&save.loaded_self_actor==55);
 variables.set_number("coins",22);assert(save.save_game(7,456));
 assert(std::strcmp(variables.get_string("name"),text.c_str())==0);assert(save.load_game(7)&&variables.get_number("coins")==22);
 assert(save.load_game(0)&&variables.get_number("coins")==50);
 restore_allowed=false;variables.set_number("coins",77);assert(!save.load_game(0)&&variables.get_number("coins")==77);restore_allowed=true;
 std::string excessive(5000,'z');variables.set_string("name",excessive.c_str());assert(!save.save_game(0));assert(save.load_game(0)&&variables.get_number("coins")==50);
 assert(!save.save_game(-1)&&!save.load_game(8)&&!save.remove_game(8));
 assert(save.remove_game(0)&&!save.has_game(0)&&!save.load_game(0));assert(variables.get_number("coins")==50);assert(save.load_game(7));
 // More than 16 actors uses the packed world while legacy slots remain readable.
 world.actors_count=129;world.actor_residency=0xD7;
 for(int i=0;i<129;++i){auto& actor=world.actors[i];actor.id=0xF0000000u+unsigned(i);actor.sprite=0xE0000000u;
  actor.x=i*16-1024;actor.y=200-i;actor.velocity=-1536;actor.remainder=-127;actor.frame=512+i;
  actor.direction=i%4;actor.animation_speed=i%9;actor.visible=i%2;actor.mode=i%5;actor.grounded=i%2;actor.climbing=(i/2)%2;actor.reverse=(i/4)%2;}
 const auto expanded=world;assert(save.save_game(6,789));world.actors_count=0;assert(save.load_game(6));
 assert(world.actors_count==129&&world.actor_residency==0xD7);
 for(int i=0;i<129;++i){const auto& a=world.actors[i];const auto& b=expanded.actors[i];
  assert(a.id==b.id&&a.sprite==b.sprite&&a.x==b.x&&a.y==b.y&&a.velocity==b.velocity&&a.remainder==b.remainder&&a.frame==b.frame);
  assert(a.direction==b.direction&&a.animation_speed==b.animation_speed&&a.visible==b.visible&&a.mode==b.mode&&a.grounded==b.grounded&&a.climbing==b.climbing&&a.reverse==b.reverse);}
 assert(save.load_game(7)&&world.actors_count==1&&world.actors[0].frame==512);

 // Variable-only snapshots work without world capture/restore hooks.
 save.game_hooks={nullptr,nullptr};
 variables.set_number("coins",9);variables.set_boolean("flag",true);variables.set_string("name",text.c_str());
 const char* coins[]={"coins"},*names[]={"name"},*missing[]={"missing"};
 const auto scene_before=world.scene;
 assert(save.save_variables(5,coins,1,false));assert(!save.has_game(5)&&!save.load_game(5));
 assert(save.save_variables(4,nullptr,0,true));
 variables.set_number("coins",99);variables.set_boolean("flag",false);variables.set_string("name","not loaded");
 assert(save.load_variables(5,coins,1,false));
 assert(variables.get_number("coins")==9&&!variables.get_boolean("flag")&&std::strcmp(variables.get_string("name"),"not loaded")==0&&world.scene==scene_before);
 assert(save.load_variables(4,names,1,false));assert(std::strcmp(variables.get_string("name"),text.c_str())==0);
 // Reloading a number must not invalidate strings loaded from another slot.
 assert(save.load_variables(5,coins,1,false));assert(std::strcmp(variables.get_string("name"),text.c_str())==0);
 assert(!save.load_variables(5,names,1,false));assert(!save.load_variables(5,missing,1,false));
 assert(!save.save_variables(5,nullptr,0,false));assert(!save.save_variables(8,coins,1,false));
 assert(save.load_variables(4,nullptr,0,true)&&variables.get_boolean("flag"));
 // Extracting variables from a full game save leaves the current world alone.
 assert(save.load_variables(7,coins,1,false)&&variables.get_number("coins")==22&&world.scene==scene_before);
 variables.set_string("name",excessive.c_str());assert(!save.save_variables(5,nullptr,0,true));
 assert(save.load_variables(5,coins,1,false)&&std::strcmp(variables.get_string("name"),excessive.c_str())==0);
 variables.set_string("name",text.c_str());assert(save.load_variables(5,coins,1,false)&&variables.get_number("coins")==9);
 assert(save.remove_game(5)&&!save.load_variables(5,coins,1,false));
 const char* other_id="36be517a-023f-41a7-bd73-c3b6bb3bbf30";
 VariableDefinition string_definitions[]={definitions[0],definitions[1],definitions[2],{other_id,VariableType::string,0,false,"Other"}};
 variables.initialize(string_definitions,4);
 const char* other[]={other_id};
 assert(save.save_variables(3,other,1,false));
 assert(save.load_variables(4,names,1,false));
 assert(std::strcmp(variables.get_string("name"),text.c_str())==0);
 assert(save.load_variables(3,other,1,false));
 assert(std::strcmp(variables.get_string("name"),text.c_str())==0&&std::strcmp(variables.get_string(other_id),"Other")==0);
 assert(save.load_variables(4,names,1,false));
 assert(std::strcmp(variables.get_string(other_id),"Other")==0);
 save.game_hooks={capture,restore};
 VariableDefinition incompatible[]={ {"coins",VariableType::boolean,0,false,""} };variables.initialize(incompatible,1);assert(!save.load_game(7));
 std::cout<<"Game/variable saves: selected/all values, long strings across partial loads, unchanged world/other variables, independent slots, capacity and compatibility passed.\n";
}
