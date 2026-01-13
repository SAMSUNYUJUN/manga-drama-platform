import { WorkflowValidationService } from './workflow-validation.service';
import { WorkflowNodeType } from '@shared/constants';

describe('WorkflowValidationService', () => {
  let service: WorkflowValidationService;

  beforeEach(() => {
    service = new WorkflowValidationService();
  });

  it('returns missing_start_or_end warning when start/end missing', () => {
    const result = service.validate(
      [
        {
          id: 'node-llm',
          type: WorkflowNodeType.LLM_PARSE_SCRIPT,
          data: { config: {} },
        } as any,
      ],
      [],
    );
    expect(result.warnings.some((item) => item.code === 'missing_start_or_end')).toBe(true);
  });

  it('detects type mismatch on edge', () => {
    const nodes = [
      {
        id: 'node-start',
        type: WorkflowNodeType.START,
        data: {
          config: {},
          inputs: [{ key: 'out', type: 'text', required: true }],
        },
      },
      {
        id: 'node-llm',
        type: WorkflowNodeType.LLM_PARSE_SCRIPT,
        data: {
          config: {},
          inputs: [{ key: 'in', type: 'json', required: true }],
        },
      },
      {
        id: 'node-end',
        type: WorkflowNodeType.END,
        data: { config: {}, inputs: [{ key: 'result', type: 'text', required: true }] },
      },
    ] as any[];
    const edges = [
      {
        id: 'edge-1',
        source: 'node-start',
        target: 'node-llm',
        sourceOutputKey: 'out',
        targetInputKey: 'in',
      },
    ];
    const result = service.validate(nodes as any, edges as any);
    expect(result.errors.some((item) => item.code === 'type_mismatch')).toBe(true);
  });

  it('detects missing required input', () => {
    const nodes = [
      {
        id: 'node-start',
        type: WorkflowNodeType.START,
        data: { config: {}, inputs: [{ key: 'out', type: 'text', required: true }] },
      },
      {
        id: 'node-target',
        type: WorkflowNodeType.GENERATE_STORYBOARD,
        data: { config: {}, inputs: [{ key: 'need', type: 'text', required: true }] },
      },
      {
        id: 'node-end',
        type: WorkflowNodeType.END,
        data: { config: {}, inputs: [{ key: 'result', type: 'text', required: true }] },
      },
    ] as any[];
    const result = service.validate(nodes as any, []);
    expect(result.errors.some((item) => item.code === 'missing_required_input')).toBe(true);
  });
});
