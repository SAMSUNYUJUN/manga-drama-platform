/**
 * 第一步：剧本拆解组件
 */

import React, { useState, useRef } from 'react';
import type { ScriptAnalysisResult } from '@shared/types/workbench.types';
import * as workbenchService from '../../../services/workbench.service';
import styles from '../Workbench.module.scss';

interface ScriptAnalysisProps {
  spaceId: number;
  onComplete: (result: ScriptAnalysisResult, savedPath: string, scriptContent: string) => void;
  initialScriptContent?: string;
  initialResult?: ScriptAnalysisResult;
  initialSavedPath?: string | null;
  initialEditedJson?: string;
  initialHasExistingSave?: boolean;
  onProgress?: (payload: {
    scriptContent?: string;
    analysisResult?: ScriptAnalysisResult;
    savedPath?: string | null;
    editedJson?: string;
    hasExistingSave?: boolean;
  }) => void;
}

const emptyResult: ScriptAnalysisResult = {
  人物: [],
  场景: [],
  道具: [],
};

const ScriptAnalysis: React.FC<ScriptAnalysisProps> = ({
  spaceId,
  onComplete,
  initialScriptContent,
  initialResult,
  initialSavedPath,
  initialEditedJson,
  initialHasExistingSave,
  onProgress,
}) => {
  const [scriptContent, setScriptContent] = useState(initialScriptContent || '');
  const [scriptFileName, setScriptFileName] = useState('');
  const [analysisResult, setAnalysisResult] = useState<ScriptAnalysisResult>(initialResult || emptyResult);
  const [editedJson, setEditedJson] = useState(
    initialEditedJson !== undefined
      ? initialEditedJson
      : initialResult
        ? JSON.stringify(initialResult, null, 2)
        : ''
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(initialSavedPath || null);
  const [hasExistingSave, setHasExistingSave] = useState<boolean>(
    initialHasExistingSave ?? !!initialSavedPath
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScriptContentChange = (value: string) => {
    setScriptContent(value);
    setSavedPath(null);
    onProgress?.({ scriptContent: value, savedPath: null });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScriptFileName(file.name);
    setError(null);
    const fileName = file.name.toLowerCase();

    try {
      // 根据文件类型选择解析方式
      if (fileName.endsWith('.txt')) {
        // 纯文本文件可以直接在前端读取
        const text = await file.text();
        setScriptContent(text);
        onProgress?.({ scriptContent: text, savedPath: null });
      } else if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
        // Word 文档需要上传到后端解析
        setIsParsing(true);
        const result = await workbenchService.parseDocument(file);
        setScriptContent(result.text);
        onProgress?.({ scriptContent: result.text, savedPath: null });
      } else {
        setError(`不支持的文件格式: ${file.name}。支持的格式: .doc, .docx, .txt`);
      }
    } catch (err: any) {
      setError(`读取文件失败: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!scriptContent.trim()) {
      setError('请先上传或输入剧本内容');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await workbenchService.runScriptAnalysis(scriptContent);
      setAnalysisResult(result);
      setEditedJson(JSON.stringify(result, null, 2));
      // 清除保存状态，要求重新保存
      setSavedPath(null);
      onProgress?.({
        analysisResult: result,
        editedJson: JSON.stringify(result, null, 2),
        savedPath: null,
      });
    } catch (err: any) {
      setError(`剧本拆解失败: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleJsonChange = (value: string) => {
    setEditedJson(value);
    setSavedPath(null); // Reset saved status when editing
    onProgress?.({ editedJson: value, savedPath: null });
  };

  const handleSave = async () => {
    setError(null);

    if (hasExistingSave && !window.confirm('资产空间已存在本步骤的文件，确认覆盖并替换为新的结果吗？')) {
      return;
    }

    // Validate JSON
    let parsedJson: ScriptAnalysisResult;
    try {
      parsedJson = JSON.parse(editedJson);
    } catch {
      setError('JSON格式不正确，请检查');
      return;
    }

    // Validate format
    const validation = await workbenchService.validateScriptAnalysis(parsedJson);
    if (!validation.valid) {
      setError(`JSON格式验证失败: ${validation.error}`);
      return;
    }

    setIsSaving(true);

    try {
      const fileName = workbenchService.generateFileName('剧本拆解', 'json');
      const path = await workbenchService.saveJsonToSpace(spaceId, fileName, parsedJson);
      setSavedPath(path);
      setHasExistingSave(true);
      setAnalysisResult(parsedJson);
      onProgress?.({
        scriptContent,
        analysisResult: parsedJson,
        savedPath: path,
        editedJson,
        hasExistingSave: true,
      });
    } catch (err: any) {
      setError(`保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (!savedPath) {
      setError('请先保存剧本拆解结果');
      return;
    }
    onComplete(analysisResult, savedPath, scriptContent);
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h2>第一步：剧本拆解</h2>
        <p className={styles.stepDescription}>
          上传小说/剧本文件，系统将自动分析并提取人物、场景、道具信息
        </p>
      </div>

      <div className={styles.uploadSection}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.doc,.docx"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isParsing}
        />
        <button 
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
        >
          {isParsing ? '⏳ 解析中...' : '📁 上传剧本文件'}
        </button>
        {scriptFileName && (
          <span className={styles.fileName}>
            已选择: {scriptFileName}
            {isParsing && ' (正在解析Word文档...)'}
          </span>
        )}
        <button
          className={styles.analyzeBtn}
          onClick={handleAnalyze}
          disabled={!scriptContent.trim() || isAnalyzing || isParsing}
        >
          {isAnalyzing ? '分析中...' : '🔍 开始剧本拆解'}
        </button>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.splitView}>
        {/* 左侧：剧本内容 */}
        <div className={styles.leftPanel}>
          <h3>剧本内容</h3>
          <textarea
            className={styles.scriptTextarea}
            value={scriptContent}
            onChange={(e) => handleScriptContentChange(e.target.value)}
            placeholder="在此粘贴或输入剧本内容..."
          />
        </div>

        {/* 右侧：JSON结果 */}
        <div className={styles.rightPanel}>
          <h3>拆解结果 (JSON)</h3>
          <textarea
            className={styles.jsonTextarea}
            value={editedJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder="剧本拆解结果将显示在这里..."
          />
          
          <div className={styles.jsonStats}>
            {analysisResult.人物.length > 0 && (
              <span>人物: {analysisResult.人物.length}</span>
            )}
            {analysisResult.场景.length > 0 && (
              <span>场景: {analysisResult.场景.length}</span>
            )}
            {analysisResult.道具.length > 0 && (
              <span>道具: {analysisResult.道具.length}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!editedJson.trim() || isSaving}
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

export default ScriptAnalysis;
