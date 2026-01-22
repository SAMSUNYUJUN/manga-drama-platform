/**
 * 漫剧生产工作台主页面
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  ScriptAnalysisResult, 
  ShotLanguageResult,
  WorkbenchState,
  CostumePhotoItem,
  KeyframeShotItem,
  ShotVideoItem,
} from '@shared/types/workbench.types';
import type { AssetSpace } from '@shared/types/asset-space.types';
import { listAssetSpaces } from '../../services/asset-space.service';
import ScriptAnalysis from './components/ScriptAnalysis';
import ShotLanguage from './components/ShotLanguage';
import CostumePhoto from './components/CostumePhoto';
import Keyframes from './components/Keyframes';
import KeyframeVideo from './components/KeyframeVideo';
import styles from './Workbench.module.scss';

const WORKBENCH_STATE_KEY = 'workbench_state_v1';

const loadInitialState = (): WorkbenchState => {
  const base: WorkbenchState = { currentStep: 1 };
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(WORKBENCH_STATE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...base, ...parsed, currentStep: parsed.currentStep || 1 };
    }
  } catch (error) {
    console.warn('Failed to restore workbench state from storage:', error);
  }
  return base;
};

const Workbench: React.FC = () => {
  const initialState = useMemo(() => loadInitialState(), []);
  const [state, setState] = useState<WorkbenchState>(initialState);
  const [spaces, setSpaces] = useState<AssetSpace[]>([]);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(true);
  const [showSpaceSelector, setShowSpaceSelector] = useState(() => !initialState.spaceId);

  // 持久化工作台状态，防止路由切换后被重置
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(WORKBENCH_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to persist workbench state:', error);
    }
  }, [state]);

  // 加载资产空间列表
  useEffect(() => {
    const loadSpaces = async () => {
      try {
        const spaceList = await listAssetSpaces();
        setSpaces(spaceList);
      } catch (err) {
        console.error('Failed to load asset spaces:', err);
      } finally {
        setIsLoadingSpaces(false);
      }
    };
    loadSpaces();
  }, []);

  const handleSelectSpace = (space: AssetSpace) => {
    setState((prev) => ({
      ...prev,
      spaceId: space.id,
      spaceName: space.name,
    }));
    setShowSpaceSelector(false);
  };

  const handleScriptAnalysisProgress = useCallback((payload: {
    scriptContent?: string;
    analysisResult?: ScriptAnalysisResult;
    savedPath?: string | null;
    editedJson?: string;
    hasExistingSave?: boolean;
  }) => {
    setState((prev) => ({
      ...prev,
      ...(payload.scriptContent !== undefined ? { scriptContent: payload.scriptContent } : {}),
      ...(payload.analysisResult !== undefined ? { scriptAnalysisResult: payload.analysisResult } : {}),
      ...(payload.savedPath !== undefined ? { scriptAnalysisSavedPath: payload.savedPath || undefined } : {}),
      ...(payload.editedJson !== undefined ? { scriptAnalysisEditedJson: payload.editedJson } : {}),
      ...(payload.hasExistingSave !== undefined ? { scriptAnalysisHasExisting: payload.hasExistingSave } : {}),
    }));
  }, []);

  const handleShotLanguageProgress = useCallback((payload: {
    result?: ShotLanguageResult;
    savedPath?: string | null;
    editedJson?: string;
    hasExistingSave?: boolean;
  }) => {
    setState((prev) => ({
      ...prev,
      ...(payload.result !== undefined ? { shotLanguageResult: payload.result } : {}),
      ...(payload.savedPath !== undefined ? { shotLanguageSavedPath: payload.savedPath || undefined } : {}),
      ...(payload.editedJson !== undefined ? { shotLanguageEditedJson: payload.editedJson } : {}),
      ...(payload.hasExistingSave !== undefined ? { shotLanguageHasExisting: payload.hasExistingSave } : {}),
    }));
  }, []);

  const handleCostumePhotoProgress = useCallback((items: CostumePhotoItem[]) => {
    setState((prev) => ({
      ...prev,
      costumePhotos: items,
    }));
  }, []);

  const handleStep1Complete = (
    result: ScriptAnalysisResult, 
    savedPath: string, 
    scriptContent: string
  ) => {
    setState((prev) => ({
      ...prev,
      currentStep: 2,
      scriptContent,
      scriptAnalysisResult: result,
      scriptAnalysisSavedPath: savedPath,
      costumePhotos: undefined,
      keyframeShots: undefined,
      shotVideos: undefined,
    }));
  };

  const handleStep2Complete = (result: ShotLanguageResult, savedPath: string) => {
    setState((prev) => ({
      ...prev,
      currentStep: 3,
      shotLanguageResult: result,
      shotLanguageSavedPath: savedPath,
      costumePhotos: undefined,
      keyframeShots: undefined,
      shotVideos: undefined,
    }));
  };

  const handleStep2Back = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 1,
      costumePhotos: undefined,
    }));
  };

  const handleStep3Back = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 2,
    }));
  };

  const handleStep4Back = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 3,
    }));
  };

  const handleStep3Complete = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 4,
      shotVideos: undefined,
    }));
  };

  const handleStep4Complete = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 5,
    }));
  };

  const handleStep5Back = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 4,
    }));
  };

  const handleChangeSpace = () => {
    setShowSpaceSelector(true);
  };

  const handleReset = () => {
    if (confirm('确定要重新开始吗？当前进度将丢失。')) {
      setState({
        currentStep: 1,
        spaceId: state.spaceId,
        spaceName: state.spaceName,
        costumePhotos: undefined,
        keyframeShots: undefined,
        shotVideos: undefined,
        videoSeconds: undefined,
      });
    }
  };

  const handleShotVideoProgress = useCallback((items: ShotVideoItem[]) => {
    setState((prev) => ({
      ...prev,
      shotVideos: items,
    }));
  }, []);

  const handleSecondsChange = useCallback((value: 10 | 15) => {
    setState((prev) => ({
      ...prev,
      videoSeconds: value,
    }));
  }, []);

  // 资产空间选择器
  if (showSpaceSelector || !state.spaceId) {
    return (
      <div className={styles.workbench}>
        <div className={styles.spaceSelector}>
          <h1>🎬 漫剧生产工作台</h1>
          <h2>请选择资产空间</h2>
          <p className={styles.hint}>
            所有生成的文件和图片将保存到选择的资产空间中
          </p>

          {isLoadingSpaces ? (
            <div className={styles.loading}>加载资产空间...</div>
          ) : spaces.length === 0 ? (
            <div className={styles.emptyState}>
              <p>暂无可用的资产空间</p>
              <a href="/assets" className={styles.createLink}>
                去创建资产空间 →
              </a>
            </div>
          ) : (
            <div className={styles.spaceList}>
              {spaces.map((space) => (
                <div
                  key={space.id}
                  className={`${styles.spaceCard} ${state.spaceId === space.id ? styles.selected : ''}`}
                  onClick={() => handleSelectSpace(space)}
                >
                  <h3>{space.name}</h3>
                  <p>{space.description || '无描述'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workbench}>
      {/* 顶部导航 */}
      <div className={styles.header}>
        <h1>🎬 漫剧生产工作台</h1>
        <div className={styles.spaceInfo}>
          <span>资产空间: {state.spaceName}</span>
          <button className={styles.changeSpaceBtn} onClick={handleChangeSpace}>
            更换
          </button>
          <button className={styles.resetBtn} onClick={handleReset}>
            重新开始
          </button>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className={styles.stepIndicator}>
        <div className={`${styles.step} ${state.currentStep >= 1 ? styles.active : ''} ${state.currentStep > 1 ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>1</span>
          <span className={styles.stepLabel}>剧本拆解</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${state.currentStep >= 2 ? styles.active : ''} ${state.currentStep > 2 ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepLabel}>镜头语言转译</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${state.currentStep >= 3 ? styles.active : ''} ${state.currentStep > 3 ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>3</span>
          <span className={styles.stepLabel}>定妆照生成</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${state.currentStep >= 4 ? styles.active : ''} ${state.currentStep > 4 ? styles.completed : ''}`}>
          <span className={styles.stepNumber}>4</span>
          <span className={styles.stepLabel}>分镜关键帧</span>
        </div>
        <div className={styles.stepLine} />
        <div className={`${styles.step} ${state.currentStep >= 5 ? styles.active : ''}`}>
          <span className={styles.stepNumber}>5</span>
          <span className={styles.stepLabel}>关键帧转视频</span>
        </div>
      </div>

      {/* 步骤内容 */}
      <div className={styles.stepContent}>
        {state.currentStep === 1 && (
          <ScriptAnalysis
            spaceId={state.spaceId!}
            onComplete={handleStep1Complete}
            initialScriptContent={state.scriptContent}
            initialResult={state.scriptAnalysisResult}
            initialSavedPath={state.scriptAnalysisSavedPath}
            initialEditedJson={state.scriptAnalysisEditedJson}
            initialHasExistingSave={state.scriptAnalysisHasExisting}
            onProgress={handleScriptAnalysisProgress}
          />
        )}

        {state.currentStep === 2 && state.scriptAnalysisResult && (
          <ShotLanguage
            spaceId={state.spaceId!}
            scriptContent={state.scriptContent!}
            analysisResult={state.scriptAnalysisResult}
            onComplete={handleStep2Complete}
            onBack={handleStep2Back}
            initialResult={state.shotLanguageResult}
            initialSavedPath={state.shotLanguageSavedPath}
            initialEditedJson={state.shotLanguageEditedJson}
            initialHasExistingSave={state.shotLanguageHasExisting}
            onProgress={handleShotLanguageProgress}
          />
        )}

        {state.currentStep === 3 && (state.scriptAnalysisResult || state.scriptAnalysisSavedPath) && (
          <CostumePhoto
            spaceId={state.spaceId!}
            analysisResult={state.scriptAnalysisResult}
            scriptAnalysisPath={state.scriptAnalysisSavedPath}
            initialItems={state.costumePhotos}
            onBack={handleStep3Back}
            onComplete={handleStep3Complete}
            onProgress={handleCostumePhotoProgress}
          />
        )}

        {state.currentStep === 4 && (state.shotLanguageResult || state.shotLanguageSavedPath) && (
          <Keyframes
            spaceId={state.spaceId!}
            shotLanguageResult={state.shotLanguageResult}
            shotLanguagePath={state.shotLanguageSavedPath}
            costumePhotos={state.costumePhotos}
            initialShots={state.keyframeShots}
            onBack={handleStep4Back}
            onNext={handleStep4Complete}
            onProgress={(shots: KeyframeShotItem[]) => {
              setState((prev) => ({ ...prev, keyframeShots: shots }));
            }}
          />
        )}

        {state.currentStep === 5 && (state.shotLanguageResult || state.shotLanguageSavedPath) && (
          <KeyframeVideo
            spaceId={state.spaceId!}
            shotLanguageResult={state.shotLanguageResult}
            shotLanguagePath={state.shotLanguageSavedPath}
            initialShots={state.shotVideos}
            initialSeconds={state.videoSeconds}
            onBack={handleStep5Back}
            onProgress={handleShotVideoProgress}
            onSecondsChange={handleSecondsChange}
          />
        )}
      </div>
    </div>
  );
};

export default Workbench;
