// Frozen pre-optimization player movement for differential behavior checks.
void ReferenceGraphicsManager::move_player_from_input()
{
    if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value() || !currentScene)
    {
        return;
    }
    const Settings* settings = get_settings();
    const int speed = settings ? bn::max(1, settings->move_speed) : 1;
    int dx = 0;
    int dy = 0;
    const bn::string<64> scene_type = currentScene->scene_type ? currentScene->scene_type : "";
    const bool platformer = scene_type == "Platformer" || scene_type == "Platform";
    const bool logo = scene_type == "Logo";
    constexpr int FIXED_POINT_SCALE = 256;
    const int PLATFORM_GRAVITY_Q8 = player_physics.config.gravity_q8;
    const int PLATFORM_JUMP_SPEED_Q8 = -player_physics.config.jump_speed_q8;
    const int PLATFORM_MAX_FALL_SPEED_Q8 = player_physics.config.max_fall_speed_q8;

    if(logo) return;
    if(InputManager::instance().held("move_left")) dx = -speed;
    else if(InputManager::instance().held("move_right")) dx = speed;
    if(InputManager::instance().held("move_up")) dy = -speed;
    else if(InputManager::instance().held("move_down")) dy = speed;
    if(!platformer && !player_physics.config.allow_diagonal && dx) dy = 0;
    if(platformer || !dx || !dy) player_diagonal_remainder_q16 = 0;
    if(!dx && !dy && !platformer) {
        set_player_animation(false);
        return;
    }

    const Sprites* player = sprite_resources[player_slot];
    const int half_width = player ? player->frame_width / 2 : 0;
    const int half_height = player ? player->frame_height / 2 : 0;
    const int old_x = player_world_x;
    const int old_y = player_world_y;
    const int collision_width = player ? bn::max(1, player->collision_width) : bn::max(1, half_width * 2);
    const int collision_height = player ? bn::max(1, player->collision_height) : bn::max(1, half_height * 2);
    const int collision_offset_x = player ? player->collision_x : -half_width;
    const int collision_offset_y = player ? player->collision_y : -half_height;
    const int min_x = -collision_offset_x;
    const int min_y = -collision_offset_y;
    const int max_x = currentScene->scene_width - collision_offset_x - collision_width;
    const int max_y = currentScene->scene_height - collision_offset_y - collision_height;
    if(min_x > max_x || min_y > max_y) return;
    const auto overlaps = [&](int x, int y, const SceneCollision& collision) {
        return x + collision_offset_x < collision.x + collision.width &&
               x + collision_offset_x + collision_width > collision.x &&
               y + collision_offset_y < collision.y + collision.height &&
               y + collision_offset_y + collision_height > collision.y;
    };
    const auto blocked = [&](int test_x, int test_y, int test_dx, int test_dy, const SceneCollision& collision) {
        if(!overlaps(test_x, test_y, collision)) return false;
        const char* side = collision.side ? collision.side : "solid";
        if(actor_motion::same_text(side, "solid")) return true;
        // Ladder tops support standing; activated climbing passes through them.
        if(actor_motion::same_text(side, "ladder")) return platformer && !player_climbing && test_dy > 0 &&
            old_y + collision_offset_y + collision_height <= collision.y;
        if(actor_motion::same_text(side, "top")) return test_dy > 0 && old_y + collision_offset_y + collision_height <= collision.y;
        if(actor_motion::same_text(side, "down")) return test_dy < 0 && old_y + collision_offset_y >= collision.y + collision.height;
        if(actor_motion::same_text(side, "left")) return test_dx > 0 && old_x + collision_offset_x + collision_width <= collision.x;
        if(actor_motion::same_text(side, "right")) return test_dx < 0 && old_x + collision_offset_x >= collision.x + collision.width;
        return false;
    };
    const auto blockingCollisionAt = [&](int test_x, int test_y, int test_dx, int test_dy) {
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
            if(index != player_ignored_platform_index && blocked(test_x, test_y, test_dx, test_dy, currentScene->collisions[index])) return index;
        return -1;
    };
    const auto blockedAt = [&](int test_x, int test_y, int test_dx, int test_dy) {
        return blockingCollisionAt(test_x, test_y, test_dx, test_dy) >= 0;
    };
    const auto supportCollisionAt = [&](int test_x, int test_y) {
        const int player_bottom = test_y + collision_offset_y + collision_height;
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
        {
            if(index == player_ignored_platform_index) continue;
            const SceneCollision& collision = currentScene->collisions[index];
            // Reject geometry first; only nearby top faces need a side check.
            if(player_bottom != collision.y || test_x + collision_offset_x >= collision.x + collision.width ||
               test_x + collision_offset_x + collision_width <= collision.x) continue;
            const char* side = collision.side ? collision.side : "solid";
            if(actor_motion::same_text(side, "solid") || actor_motion::same_text(side, "top") ||
               (actor_motion::same_text(side, "ladder") && !player_climbing)) return index;
        }
        return -1;
    };
    const auto landingCollisionAt = [&](int test_x, int test_y) {
        const int previous_bottom = old_y + collision_offset_y + collision_height;
        const int next_bottom = test_y + collision_offset_y + collision_height;
        if(next_bottom <= previous_bottom) return -1;
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
        {
            if(index == player_ignored_platform_index) continue;
            const SceneCollision& collision = currentScene->collisions[index];
            const char* side = collision.side ? collision.side : "solid";
            const bool supports_player = actor_motion::same_text(side, "solid") || actor_motion::same_text(side, "top") || (actor_motion::same_text(side, "ladder") && !player_climbing);
            if(supports_player && previous_bottom <= collision.y && next_bottom > collision.y &&
               overlaps(test_x, test_y, collision)) return index;
        }
        return -1;
    };

    if(platformer)
    {
        // Ground only on an actual top face; overlap with a solid wall is not support.
        const int support_collision = player_vertical_velocity_q8 >= 0 ? supportCollisionAt(old_x, old_y) : -1;
        player_grounded = !player_physics.impulse_pending && player_vertical_velocity_q8 >= 0 &&
            (old_y >= max_y || support_collision >= 0);
        const bool jump_pressed = InputManager::instance().pressed("jump");
        const int climb_input = dy;
        // Down can reattach from a collision box resting exactly on the top.
        const bool on_ladder = player_on_ladder(old_x, old_y) ||
            (climb_input > 0 && player_on_ladder(old_x, old_y + 1));
        if(!on_ladder) player_climbing = false;
        const bool forced_impulse = player_physics.impulse_pending;
        const bool jumping = player_physics.jump(jump_pressed, player_grounded || player_climbing);
        player_physics.impulse_pending = false;
        if(on_ladder && climb_input && !jumping && !forced_impulse) player_climbing = true;
        const bool dropping_through_platform = !jumping && !on_ladder && player_grounded && support_collision >= 0 &&
            currentScene->collisions[support_collision].side &&
            actor_motion::same_text(currentScene->collisions[support_collision].side, "top") &&
            InputManager::instance().pressed("move_down");
        if(dropping_through_platform)
        {
            player_ignored_platform_index = support_collision;
            player_drop_through_active = true;
            player_grounded = false;
        }
        dy = player_climbing ? climb_input : 0;
        if(jumping)
        {
            player_vertical_velocity_q8 = PLATFORM_JUMP_SPEED_Q8;
            player_vertical_remainder_q8 = 0;
            dy = 0;
            player_grounded = false;
            player_climbing = false;
        }

        if(player_climbing && !jumping)
        {
            // Only an activated ladder suspends gravity. Released controls hold
            // the player still; merely touching a ladder never starts climbing.
            player_vertical_velocity_q8 = 0;
            player_vertical_remainder_q8 = 0;
            player_grounded = false;
        }
        else if(player_grounded && !jumping)
        {
            player_vertical_velocity_q8 = 0;
            player_vertical_remainder_q8 = 0;
            dy = 0;
        }
        else
        {
            player_vertical_velocity_q8 = bn::min(
                PLATFORM_MAX_FALL_SPEED_Q8,
                player_vertical_velocity_q8 + PLATFORM_GRAVITY_Q8);
            player_vertical_remainder_q8 += player_vertical_velocity_q8;
            dy = player_vertical_remainder_q8 / FIXED_POINT_SCALE;
            player_vertical_remainder_q8 -= dy * FIXED_POINT_SCALE;
        }
    }

    if(dx < 0) player_direction = "left";
    else if(dx > 0) player_direction = "right";
    else if(!platformer && dy < 0) player_direction = "up";
    else if(!platformer && dy > 0) player_direction = "down";

    bool fractional_diagonal_frame = false;
    if(!platformer && dx && dy) {
        // 1/sqrt(2) in Q16 keeps the diagonal vector at the configured speed.
        // Retain fractions so a speed of one pixel never rounds to a standstill.
        player_diagonal_remainder_q16 += speed * 46341;
        const int diagonal_step = player_diagonal_remainder_q16 / 65536;
        fractional_diagonal_frame = diagonal_step == 0;
        player_diagonal_remainder_q16 %= 65536;
        dx = dx < 0 ? -diagonal_step : diagonal_step;
        dy = dy < 0 ? -diagonal_step : diagonal_step;
    }

    const int next_x = bn::clamp(old_x + dx, min_x, max_x);
    const int raw_next_y = old_y + dy;
    const int next_y = bn::clamp(raw_next_y, min_y, max_y);

    // Sweep each axis a pixel at a time so configurable speeds/impulses cannot
    // skip thin walls, platforms or ceilings. Event values cap this at 16 steps.
    int resolved_x = old_x;
    int resolved_y = old_y;
    const int step_x = next_x < old_x ? -1 : 1;
    while(resolved_x != next_x)
    {
        if(blockedAt(resolved_x + step_x, old_y, dx, 0)) break;
        resolved_x += step_x;
    }
    const int step_y = next_y < old_y ? -1 : 1;
    while(resolved_y != next_y)
    {
        const int candidate_y = resolved_y + step_y;
        if(blockedAt(resolved_x, candidate_y, 0, dy))
        {
            if(platformer)
            {
                const int landing_collision = dy > 0 ? landingCollisionAt(resolved_x, candidate_y) : -1;
                player_grounded = landing_collision >= 0;
                if(landing_collision >= 0)
                {
                    const SceneCollision& landing = currentScene->collisions[landing_collision];
                    resolved_y = landing.y - collision_offset_y - collision_height;
                }
                player_vertical_velocity_q8 = 0;
                player_vertical_remainder_q8 = 0;
            }
            break;
        }
        resolved_y = candidate_y;
        if(platformer && dy > 0 && resolved_y == max_y) player_grounded = true;
    }
    if(platformer && dy > 0 && next_y == max_y && resolved_y == max_y)
    {
        player_grounded = true;
        player_vertical_velocity_q8 = 0;
        player_vertical_remainder_q8 = 0;
    }
    if(player_ignored_platform_index >= 0 && player_ignored_platform_index < currentScene->collisions_count)
    {
        const SceneCollision& ignored_platform = currentScene->collisions[player_ignored_platform_index];
        const bool still_overlapping_horizontally = resolved_x + collision_offset_x < ignored_platform.x + ignored_platform.width &&
            resolved_x + collision_offset_x + collision_width > ignored_platform.x;
        const int platform_height = bn::max(1, ignored_platform.height);
        if(!still_overlapping_horizontally || resolved_y + collision_offset_y >= ignored_platform.y + platform_height)
            player_ignored_platform_index = -1;
    }
    if(player_climbing && (!platformer || !player_on_ladder(resolved_x, resolved_y))) player_climbing = false;
    // Keep a stationary jump animated throughout ascent, apex and descent.
    // A ceiling collision stops velocity without grounding the player.
    if(platformer && !player_climbing)
    {
        const int support_collision = player_vertical_velocity_q8 >= 0 ? supportCollisionAt(resolved_x, resolved_y) : -1;
        player_grounded = player_vertical_velocity_q8 >= 0 && (resolved_y >= max_y || support_collision >= 0);
        if(player_grounded && player_vertical_velocity_q8 >= 0)
            player_vertical_velocity_q8 = player_vertical_remainder_q8 = 0;
    }
    player_world_x = resolved_x;
    player_world_y = resolved_y;
    const bool freeze_drop_animation = player_drop_through_active && !player_grounded && !dx;
    if(player_grounded)
    {
        player_drop_through_active = false;
        player_ignored_platform_index = -1;
    }
    if(player_grounded || player_climbing) player_physics.air_jumps_used = 0;
    const bool airborne = platformer && !player_grounded && !player_climbing;
    const bool horizontal_input_blocked = dx != 0 && resolved_x == old_x;
    if(!freeze_drop_animation)
        set_player_animation(resolved_x != old_x || resolved_y != old_y || fractional_diagonal_frame,
            player_climbing ? "climb" : airborne && (!dx || horizontal_input_blocked) ? "jump" : nullptr);
    set_sprite_group_position(player_slot, player_world_x, player_world_y);
}
