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
    AssetType["WORKFLOW_TEST"] = "workflow_test";
    AssetType["TASK_EXECUTION"] = "task_execution";
})(AssetType || (exports.AssetType = AssetType = {}));
//# sourceMappingURL=enums.js.map