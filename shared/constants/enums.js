"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetType = exports.TaskStage = exports.TaskStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["USER"] = "USER";
})(UserRole || (exports.UserRole = UserRole = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "PENDING";
    TaskStatus["PROCESSING"] = "PROCESSING";
    TaskStatus["PAUSED"] = "PAUSED";
    TaskStatus["COMPLETED"] = "COMPLETED";
    TaskStatus["FAILED"] = "FAILED";
    TaskStatus["CANCELLED"] = "CANCELLED";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var TaskStage;
(function (TaskStage) {
    TaskStage["SCRIPT_UPLOADED"] = "SCRIPT_UPLOADED";
    TaskStage["STORYBOARD_GENERATED"] = "STORYBOARD_GENERATED";
    TaskStage["CHARACTER_DESIGNED"] = "CHARACTER_DESIGNED";
    TaskStage["SCENE_GENERATED"] = "SCENE_GENERATED";
    TaskStage["KEYFRAME_GENERATING"] = "KEYFRAME_GENERATING";
    TaskStage["KEYFRAME_COMPLETED"] = "KEYFRAME_COMPLETED";
    TaskStage["VIDEO_GENERATING"] = "VIDEO_GENERATING";
    TaskStage["VIDEO_COMPLETED"] = "VIDEO_COMPLETED";
    TaskStage["FINAL_COMPOSING"] = "FINAL_COMPOSING";
    TaskStage["COMPLETED"] = "COMPLETED";
})(TaskStage || (exports.TaskStage = TaskStage = {}));
var AssetType;
(function (AssetType) {
    AssetType["ORIGINAL_SCRIPT"] = "original_script";
    AssetType["STORYBOARD_SCRIPT"] = "storyboard_script";
    AssetType["CHARACTER_DESIGN"] = "character_design";
    AssetType["SCENE_IMAGE"] = "scene_image";
    AssetType["KEYFRAME_IMAGE"] = "keyframe_image";
    AssetType["STORYBOARD_VIDEO"] = "storyboard_video";
    AssetType["FINAL_VIDEO"] = "final_video";
})(AssetType || (exports.AssetType = AssetType = {}));
//# sourceMappingURL=enums.js.map