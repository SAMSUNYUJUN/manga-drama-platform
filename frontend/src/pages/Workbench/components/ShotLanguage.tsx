/**
 * 第二步：镜头语言转译组件
 */

import React, { useState, useEffect } from 'react';
import type { ScriptAnalysisResult, ShotLanguageResult } from '@shared/types/workbench.types';
import * as workbenchService from '../../../services/workbench.service';
import styles from '../Workbench.module.scss';

interface ShotLanguageProps {
  spaceId: number;
  scriptContent: string;
  analysisResult: ScriptAnalysisResult;
  onComplete: (result: ShotLanguageResult, savedPath: string) => void;
  onBack: () => void;
  initialResult?: ShotLanguageResult;
  initialSavedPath?: string | null;
  initialEditedJson?: string;
  initialHasExistingSave?: boolean;
  onProgress?: (payload: {
    result?: ShotLanguageResult;
    savedPath?: string | null;
    editedJson?: string;
    hasExistingSave?: boolean;
  }) => void;
}

const emptyShotResult: ShotLanguageResult = {
  镜头列表: [],
};

const ShotLanguage: React.FC<ShotLanguageProps> = ({
  spaceId,
  scriptContent,
  analysisResult,
  onComplete,
  onBack,
  initialResult,
  initialSavedPath,
  initialEditedJson,
  initialHasExistingSave,
  onProgress,
}) => {
  const [shotResult, setShotResult] = useState<ShotLanguageResult>(initialResult || emptyShotResult);
  const [editedJson, setEditedJson] = useState(
    initialEditedJson !== undefined
      ? initialEditedJson
      : initialResult
        ? JSON.stringify(initialResult, null, 2)
        : ''
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(initialSavedPath || null);
  const [hasExistingSave, setHasExistingSave] = useState<boolean>(
    initialHasExistingSave ?? !!initialSavedPath
  );

  // 自动执行镜头语言转译
  useEffect(() => {
    if (!initialResult && !shotResult.镜头列表.length) {
      handleProcess();
    }
  }, []);

  const handleProcess = async () => {
    setIsProcessing(true);
    setError(null);
    setSavedPath(null);
    onProgress?.({ savedPath: null });

    try {
      const result = await workbenchService.runShotLanguage(scriptContent, analysisResult);
      setShotResult(result);
      const json = JSON.stringify(result, null, 2);
      setEditedJson(json);
      onProgress?.({ result, editedJson: json, savedPath: null });
    } catch (err: any) {
      setError(`镜头语言转译失败: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJsonChange = (value: string) => {
    setEditedJson(value);
    setSavedPath(null);
    onProgress?.({ editedJson: value, savedPath: null });
  };

  const handleSave = async () => {
    setError(null);

    if (hasExistingSave && !window.confirm('资产空间已存在本步骤的文件，确认覆盖并替换为新的结果吗？')) {
      return;
    }

    // Validate JSON
    let parsedJson: ShotLanguageResult;
    try {
      parsedJson = JSON.parse(editedJson);
    } catch {
      setError('JSON格式不正确，请检查');
      return;
    }

    // Validate format
    const validation = await workbenchService.validateShotLanguage(parsedJson);
    if (!validation.valid) {
      setError(`JSON格式验证失败: ${validation.error}`);
      return;
    }

    setIsSaving(true);

    try {
      const fileName = workbenchService.generateFileName('镜头语言转译', 'json');
      const path = await workbenchService.saveJsonToSpace(spaceId, fileName, parsedJson);
      setSavedPath(path);
      setHasExistingSave(true);
      setShotResult(parsedJson);
      onProgress?.({ result: parsedJson, savedPath: path, editedJson, hasExistingSave: true });
    } catch (err: any) {
      setError(`保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (!savedPath) {
      setError('请先保存镜头语言转译结果');
      return;
    }
    onComplete(shotResult, savedPath);
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2>第二步：镜头语言转译</h2>
        <p className={styles.stepDescription}>
          根据剧本内容和拆解结果，生成详细的镜头列表
        </p>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {isProcessing && (
        <div className={styles.processingOverlay}>
          <div className={styles.processingContent}>
            <div className={styles.spinner} />
            <p>正在进行镜头语言转译...</p>
          </div>
        </div>
      )}

      <div className={styles.splitView}>
        {/* 左侧：剧本拆解结果和原文 */}
        <div className={styles.leftPanel}>
          <div className={styles.leftSection}>
            <h3>剧本拆解结果</h3>
            <div className={styles.analysisPreview}>
              <div className={styles.analysisSummary}>
                <span>👤 人物: {analysisResult.人物.length}</span>
                <span>🏞️ 场景: {analysisResult.场景.length}</span>
                <span>🎭 道具: {analysisResult.道具.length}</span>
              </div>
              <pre className={styles.jsonPreview}>
                {JSON.stringify(analysisResult, null, 2)}
              </pre>
            </div>
          </div>
          
          <div className={styles.leftSection}>
            <h3>剧本原文</h3>
            <div className={styles.scriptPreview}>
              {scriptContent.slice(0, 2000)}
              {scriptContent.length > 2000 && '...'}
            </div>
          </div>
        </div>

        {/* 右侧：镜头语言结果 */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h3>镜头列表 (JSON)</h3>
            <button
              className={styles.reprocessBtn}
              onClick={handleProcess}
              disabled={isProcessing}
            >
              🔄 重新生成
            </button>
          </div>
          
          <textarea
            className={styles.jsonTextarea}
            value={editedJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder="镜头语言转译结果将显示在这里..."
            disabled={isProcessing}
          />
          
          {shotResult.镜头列表.length > 0 && (
            <div className={styles.shotStats}>
              <span>共 {shotResult.镜头列表.length} 个镜头</span>
              <span>
                总时长: {shotResult.镜头列表.reduce((sum, shot) => sum + shot.时长秒, 0)} 秒
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actionBar}>
        <button className={styles.backBtn} onClick={onBack}>
          ← 上一步
        </button>
        
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!editedJson.trim() || isSaving || isProcessing}
        >
          {isSaving ? '保存中...' : '💾 保存到资产空间'}
        </button>
        
        {savedPath && (
          <span className={styles.savedStatus}>✅ 已保存: {savedPath}</span>
        )}

        <button
          className={styles.nextBtn}
          onClick={handleNext}
          disabled={!savedPath}
        >
          下一步 →
        </button>
      </div>
    </div>
  );
};

export default ShotLanguage;
