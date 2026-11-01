#pragma once
class CameraManager {
public:
    static CameraManager& instance() { static CameraManager value; return value; }
    void update() {}
};
