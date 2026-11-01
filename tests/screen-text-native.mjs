import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/dialogue_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const header = fs.readFileSync('tools/butano/template/include/dialogue_manager.h', 'utf8');
const types = fs.readFileSync('tools/butano/template/include/resource_types.h', 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const method = name => {
  const start = Math.max(source.indexOf(`bool DialogueManager::${name}(`), source.indexOf(`void DialogueManager::${name}(`));
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-screen-text-'));
try {
  const cpp = path.join(temporary, 'text.cpp'), executable = path.join(temporary, 'text.exe');
  fs.writeFileSync(cpp, `
#include <algorithm>
#include <array>
#include <cassert>
#include <memory>
#include <string>
#include <string_view>
#include <vector>
#define GBA_STUDIO_FEATURE_UI_ANIMATION 1
template<class... T> void quiet_log(const T&...) {}
#define BN_LOG(...) quiet_log(__VA_ARGS__)
namespace bn {
template<int N> struct string : std::string { using std::string::string; using std::string::operator=; int size() const { return int(std::string::size()); } };
using string_view=std::string_view;
template<class T> struct ivector:std::vector<T> { int size() const { return int(std::vector<T>::size()); } };
using std::max; using std::clamp;
int allocation_limit=128;
struct sprite_ptr { struct state { inline static int alive=0; state(){++alive;} ~state(){--alive;} bool visible=true; }; std::shared_ptr<state> value=std::make_shared<state>(); void set_visible(bool visible){value->visible=visible;} };
struct sprite_font {
 struct item_type { item_type shape_size() const{return{};} int height() const{return 16;} item_type tiles_item() const{return{};} int graphics_count()const{return 128;} int tiles_count_per_graphic()const{return 1;} };
 item_type item() const{return{};}
};
struct sprite_text_generator {
 const sprite_font& selected; std::string painted; int painted_x=0;
 explicit sprite_text_generator(const sprite_font& font):selected(font){}
 const sprite_font& font() const{return selected;} void set_bg_priority(int){} void set_z_order(int){}
 int width(std::string_view text) const { int result=0; for(unsigned char ch:text) if((ch&0xC0)!=0x80)result+=ch=='i'?3:8; return result; }
 bool generate_top_left_optional(int x,int,std::string_view text,ivector<sprite_ptr>& output) {
  painted=text;painted_x=x;
  for(unsigned char ch:text) if(ch!=' '&&(ch&0xC0)!=0x80){if(sprite_ptr::state::alive>=allocation_limit)return false;output.emplace_back();}
  return true;
 }
};
}
namespace common { const bn::sprite_font fixed_8x16_sprite_font{}, fixed_8x8_sprite_font{}, variable_16x16_sprite_font{}, variable_8x8_sprite_font{}, variable_8x16_sprite_font{}; }
${extract('    int utf8_sequence_size(', '    bool utf8_continuation(')}
constexpr int max_dialogue_bytes=255;
enum class VariableType { number, boolean, string };
struct VariableDefinition { VariableType type; };
struct VariableManager {
 static VariableManager& instance(){static VariableManager manager;return manager;}
 const VariableDefinition* find(const char* id) const {
  static VariableDefinition number{VariableType::number}, boolean{VariableType::boolean}, text{VariableType::string};
  if(std::string(id)=="3e089418-5bba-4e48-b24b-3e59e313a9d4") return &number;
  if(std::string(id)=="8ef704a3-7ca0-4e09-af41-c49783b842b8") return &text;
  if(std::string(id)=="b9d13543-5457-4bd4-a01f-fc30d073d6cf") return &boolean;
  return nullptr;
 }
 int get_number(const char*) const{return 42;}bool get_boolean(const char*) const{return true;}
 const char* get_string(const char*) const{return "Ada";}
};
namespace bn {template<int N> string<N> to_string(int value){string<N> result;result=std::to_string(value);return result;}}
${extract('    void append_utf8_limited(', '\n}\n\nDialogueManager&')}
bn::string<256> sanitize_utf8(const bn::string<256>& text){return text;}

${['UiSetTextEventData','UiTargetEventData'].map(name => types.match(new RegExp('struct '+name+' \\{[\\s\\S]*?\\n\\};'))[0]).join('\n')}
struct DialogueManager {
 ${header.match(/struct UiElementState \{[\s\S]*?\n    \};/)[0]}
 std::array<UiElementState,16> ui_elements{};
 bn::ivector<bn::sprite_ptr> ui_rendered_sprites;
 const char* last_ui_id=nullptr;
 bool set_ui_text(const UiSetTextEventData&);bool set_ui_hidden(const UiTargetEventData&,bool);bool destroy_ui(const UiTargetEventData&);
 void release_ui_sprites(UiElementState&);void render_ui_text();
};
${['set_ui_text','release_ui_sprites','set_ui_hidden','destroy_ui','render_ui_text'].map(method).join('\n')}
int main(){
 bn::sprite_text_generator generator(common::fixed_8x16_sprite_font);bn::ivector<bn::sprite_ptr> output;
 for(const auto& point:std::array<std::array<int,2>,4>{{{{240,0}},{{-40,0}},{{0,160}},{{0,-16}}}}) { assert(generate_screen_text(generator,point[0],point[1],"ABCD",output));assert(output.empty()); }
 assert(generate_screen_text(generator,232,0,"ABCD",output));assert(output.size()==1&&generator.painted=="A");output.clear();
 assert(generate_screen_text(generator,-9,0,"ABCD",output));assert(output.size()==3&&generator.painted=="BCD"&&generator.painted_x==-1);output.clear();
 assert(generate_screen_text(generator,-9,0,"iiiW",output));assert(output.size()==1&&generator.painted=="W"&&generator.painted_x==0);output.clear();
 assert(generate_screen_text(generator,232,-15,"\\xC3\\xA1" "B",output));assert(output.size()==1&&generator.painted=="\\xC3\\xA1");output.clear();
 output.emplace_back();bn::allocation_limit=2;assert(!generate_screen_text(generator,0,0,"ABCD",output));assert(output.size()==1);output.clear();bn::allocation_limit=128;
 assert(interpolate("Score: \u0024{3e089418-5bba-4e48-b24b-3e59e313a9d4}")=="Score: 42");
 assert(interpolate("\u0024{8ef704a3-7ca0-4e09-af41-c49783b842b8} \u0024{b9d13543-5457-4bd4-a01f-fc30d073d6cf}")=="Ada true");
 assert(interpolate("Cost \u0024100")=="Cost \u0024100");
 assert(interpolate("\u0024{missing}").empty());
 std::string long_template;for(int i=0;i<10;++i)long_template+="\u0024{3e089418-5bba-4e48-b24b-3e59e313a9d4}";
 assert(long_template.size()>255);assert(interpolate(long_template.c_str())=="42424242424242424242");
 long_template=std::string(253,'x')+"\u0024{3e089418-5bba-4e48-b24b-3e59e313a9d4}";assert(interpolate(long_template.c_str()).size()==255);
 DialogueManager manager;
 std::string long_ui_template;for(int i=0;i<10;++i)long_ui_template+="\u0024{3e089418-5bba-4e48-b24b-3e59e313a9d4}";
 assert(manager.set_ui_text({"long-template",long_ui_template.c_str(),0,0,"fixed8x16"}));manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==20);
 assert(manager.destroy_ui({"long-template"}));
 assert(manager.set_ui_text({"interpolation","\u0024{3e089418-5bba-4e48-b24b-3e59e313a9d4}",0,0,"fixed8x16"}));
 manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==2);
 assert(manager.destroy_ui({"interpolation"}));
 assert(manager.set_ui_text({"text","ABCDEFGHIJ",0,0,"fixed8x16"}));manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10);
 auto& text=manager.ui_elements[0];std::weak_ptr<bn::sprite_ptr::state> old=manager.ui_rendered_sprites[0].value;
 text.move_active=true;text.move_elapsed=7;
 assert(manager.set_ui_hidden({"text"},true));assert(old.expired()&&manager.ui_rendered_sprites.empty());assert(text.move_active&&text.move_elapsed==7);
 assert(manager.set_ui_hidden({"text"},false));manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10&&text.move_elapsed==7);
 assert(manager.set_ui_text({"offscreen","ABCDEFGHIJ",240,0,"fixed8x16"}));manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10);
 std::weak_ptr<bn::sprite_ptr::state> unchanged=manager.ui_rendered_sprites[0].value;
 auto& moving=manager.ui_elements[1];moving.text.x=232;moving.dirty=true;manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==11&&!unchanged.expired());
 moving.text.x=0;moving.dirty=true;manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==20&&!unchanged.expired());
 moving.blink_active=true;moving.blink_visible=false;manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10&&!moving.rendered);
 moving.blink_visible=true;manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==20);
 assert(manager.destroy_ui({"text"}));assert(unchanged.expired()&&manager.ui_rendered_sprites.size()==10);
 moving.text.y=160;moving.dirty=true;manager.render_ui_text();assert(manager.ui_rendered_sprites.empty());
 moving.text.y=0;moving.dirty=true;bn::allocation_limit=3;manager.render_ui_text();assert(manager.ui_rendered_sprites.empty()&&!moving.rendered);
 bn::allocation_limit=128;manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10&&moving.rendered);
 for(int i=0;i<100;++i){assert(manager.set_ui_hidden({"offscreen"},true));assert(manager.ui_rendered_sprites.empty());assert(manager.set_ui_hidden({"offscreen"},false));manager.render_ui_text();assert(manager.ui_rendered_sprites.size()==10);}
 assert(manager.destroy_ui({"offscreen"}));assert(bn::sprite_ptr::state::alive==0);
}
`);
  const compiled = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', cpp, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Production text sprite lifecycle passed: viewport clipping, partial glyphs, UTF-8, variable advances, hidden/blinking UI release, motion reconstruction, unaffected UI caches, allocation rollback/retry and 100 hide/show cycles without retained sprites.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-screen-text-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
