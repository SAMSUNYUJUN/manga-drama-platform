/**
 * Workflow validation service
 * @module workflow/validation
 */

import { Injectable } from '@nestjs/common';
import { WorkflowNodeType } from '@shared/constants';
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from '@shared/types/workflow.types';
import { isTypeCompatible, normalizeWorkflowVersion } from './workflow-utils';

@Injectable()
export class WorkflowValidationService {
  validate(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowValidationResult {
    const hasStart = nodes.some((node) => node.type === WorkflowNodeType.START || node.data?.nodeType === WorkflowNodeType.START);
    const hasEnd = nodes.some((node) => node.type === WorkflowNodeType.END || node.data?.nodeType === WorkflowNodeType.END);
    const { nodes: normalizedNodes, edges: normalizedEdges } = normalizeWorkflowVersion(nodes, edges);
    const errors: WorkflowValidationIssue[] = [];
    const warnings: WorkflowValidationIssue[] = [];
    const nodeMap = new Map(normalizedNodes.map((node) => [node.id, node]));

    const startNodes = normalizedNodes.filter((node) => node.type === WorkflowNodeType.START);
    const endNodes = normalizedNodes.filter((node) => node.type === WorkflowNodeType.END);
    if (!hasStart || !hasEnd) {
      warnings.push({
        code: 'missing_start_or_end',
        message: '检测到缺失的 Start/End 节点，已自动补齐',
      });
    }
    if (startNodes.length !== 1 || endNodes.length !== 1) {
      errors.push({
        code: 'missing_start_or_end',
        message: '工作流必须包含且仅包含一个 Start 与 End 节点',
      });
    }

    normalizedEdges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) {
        errors.push({
          code: 'dangling_edge',
          message: '连线存在悬空节点',
          edgeId: edge.id,
        });
        return;
      }
      if (source.type === WorkflowNodeType.END) {
        errors.push({
          code: 'dangling_edge',
          message: 'End 节点不能作为输出端',
          edgeId: edge.id,
          nodeId: source.id,
        });
      }
      if (target.type === WorkflowNodeType.START) {
        errors.push({
          code: 'dangling_edge',
          message: 'Start 节点不能作为输入端',
          edgeId: edge.id,
          nodeId: target.id,
        });
      }
      const sourceVar = source.data?.outputs?.find((item) => item.key === edge.sourceOutputKey);
      const targetVar = target.data?.inputs?.find((item) => item.key === edge.targetInputKey);
      if (!sourceVar || !targetVar) {
        errors.push({
          code: 'dangling_edge',
          message: '连线缺少映射变量',
          edgeId: edge.id,
        });
        return;
      }
      const compatibility = isTypeCompatible(sourceVar.type, targetVar.type);
      if (!compatibility.ok) {
        errors.push({
          code: 'type_mismatch',
          message: `类型不匹配: ${sourceVar.type} -> ${targetVar.type}`,
          edgeId: edge.id,
          nodeId: target.id,
        });
      }
    });

    normalizedNodes.forEach((node) => {
      if (node.type === WorkflowNodeType.START) {
        if (!node.data?.outputs?.length) {
          errors.push({
            code: 'missing_required_input',
            message: 'Start 节点必须至少定义一个输出变量',
            nodeId: node.id,
          });
        }
        return;
      }
      if (node.type === WorkflowNodeType.END) {
        const incoming = normalizedEdges.filter((edge) => edge.target === node.id);
        if (!incoming.length) {
          errors.push({
            code: 'missing_required_input',
            message: 'End 节点必须有输入连线',
            nodeId: node.id,
          });
        }
      }
      const requiredInputs = (node.data?.inputs || []).filter((input) => input.required);
      requiredInputs.forEach((input) => {
        const hasEdge = normalizedEdges.some(
          (edge) => edge.target === node.id && edge.targetInputKey === input.key,
        );
        if (!hasEdge && input.defaultValue === undefined) {
          errors.push({
            code: 'missing_required_input',
            message: `缺少必填输入: ${input.name || input.key}`,
            nodeId: node.id,
          });
        }
      });
    });

    const reachable = new Set<string>();
    const start = startNodes[0];
    if (start) {
      const queue: string[] = [start.id];
      while (queue.length) {
        const current = queue.shift()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        normalizedEdges
          .filter((edge) => edge.source === current)
          .forEach((edge) => queue.push(edge.target));
      }
    }
    normalizedNodes.forEach((node) => {
      if (!reachable.has(node.id)) {
        warnings.push({
          code: 'unreachable_nodes',
          message: '节点不可达',
          nodeId: node.id,
        });
      }
    });

    if (this.hasCycle(normalizedNodes, normalizedEdges)) {
      errors.push({
        code: 'cycles_not_allowed',
        message: '当前引擎不支持环状连线',
      });
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }

  private hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const graph: Record<string, string[]> = {};
    nodes.forEach((node) => {
      graph[node.id] = [];
    });
    edges.forEach((edge) => {
      graph[edge.source] = graph[edge.source] || [];
      graph[edge.source].push(edge.target);
    });

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visiting.add(nodeId);
      for (const neighbor of graph[nodeId] || []) {
        if (dfs(neighbor)) return true;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };

    return nodes.some((node) => dfs(node.id));
  }
}
