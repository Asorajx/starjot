import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { DrawingLayerInfo, DrawingStroke } from '../../../../shared/types/note';
import { MAX_LAYERS, TEXT_LAYER, strokeLayer } from './drawing';
import type { EditorSession } from '../session';

type LayersMenuProps = {
  session: EditorSession;
  strokes: DrawingStroke[];
  layers: DrawingLayerInfo[];
  active: string;
  onActivate: (id: string) => void;
};


/* =========================
   Layer Changes
   ========================= */

/* A new layer's name: one more than the highest "Layer n" so far. */
function nextName(layers: DrawingLayerInfo[]) {
  const numbers = layers.map(layer => Number(layer.name.match(/^Layer (\d+)$/)?.[1] ?? 0));
  return `Layer ${Math.max(0, ...numbers) + 1}`;
}

/* Move one entry up or down the list (towards the top of the page is up: later in the list). */
function moveLayer(layers: DrawingLayerInfo[], id: string, direction: 1 | -1) {
  const index = layers.findIndex(layer => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return layers;
  const next = [...layers];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}


/* =========================
   Layers Menu
   ========================= */

/* The drawing's layers, top first, with the note's text among them. Click a layer's name to draw */
/* on it (double-click to rename it); the eye hides or shows it; the arrows move it up or down, */
/* also past the text, so a layer can sit under the text like a background sketch. Removing a */
/* layer removes its strokes. Every change is a step in the note's undo history. */
export function LayersMenu({ session, strokes, layers, active, onActivate }: LayersMenuProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const drawingLayers = layers.filter(layer => layer.id !== TEXT_LAYER);

  function save(next: DrawingLayerInfo[], nextStrokes = strokes) {
    session.saveDrawing(nextStrokes, next);
  }

  /* A new layer goes just above the one being drawn on, and is drawn on next. */
  function add() {
    if (drawingLayers.length >= MAX_LAYERS) return;
    const layer = { id: `layer-${Date.now().toString(36)}`, name: nextName(layers), hidden: false };
    const index = layers.findIndex(item => item.id === active);
    save([...layers.slice(0, index + 1), layer, ...layers.slice(index + 1)]);
    onActivate(layer.id);
  }

  /* Removing the layer being drawn on moves drawing to the layer below it (or above it). */
  function remove(id: string) {
    if (drawingLayers.length <= 1) return;
    const next = layers.filter(layer => layer.id !== id);
    save(next, strokes.filter(stroke => strokeLayer(stroke, layers) !== id));
    if (id === active) {
      const index = drawingLayers.findIndex(layer => layer.id === id);
      onActivate((drawingLayers[index - 1] ?? drawingLayers[index + 1]).id);
    }
  }

  function rename(id: string) {
    const clean = name.trim().slice(0, 30);
    setRenaming(null);
    const layer = layers.find(item => item.id === id);
    if (clean && layer && clean !== layer.name) save(layers.map(item => (item.id === id ? { ...item, name: clean } : item)));
  }

  const shown = [...layers].reverse();

  return (
    <div className="drawing-menu drawing-layers" role="dialog" aria-label="Layers">
      <span className="drawing-menu-heading">
        Layers
        <button
          type="button"
          className="drawing-layer-add"
          data-tooltip={drawingLayers.length >= MAX_LAYERS ? `Up to ${MAX_LAYERS} layers` : 'Add a layer'}
          aria-label="Add a layer"
          disabled={drawingLayers.length >= MAX_LAYERS}
          onClick={add}
        >
          <Icon name="plus" size={14} />
        </button>
      </span>
      <ul className="drawing-layer-list">
        {shown.map((layer, position) => {
          const index = layers.length - 1 - position;
          if (layer.id === TEXT_LAYER) {
            return (
              <li key={layer.id} className="drawing-layer-row is-text">
                <Icon name="type" size={14} />
                <span className="drawing-layer-name">Text</span>
              </li>
            );
          }
          return (
            <li key={layer.id} className={`drawing-layer-row ${layer.id === active ? 'is-active' : ''} ${layer.hidden ? 'is-hidden' : ''}`}>
              <button
                type="button"
                className="drawing-layer-button"
                data-tooltip={layer.hidden ? 'Show' : 'Hide'}
                aria-label={`${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`}
                onClick={() => save(layers.map(item => (item.id === layer.id ? { ...item, hidden: !item.hidden } : item)))}
              >
                <Icon name={layer.hidden ? 'eye-off' : 'eye'} size={14} />
              </button>
              {renaming === layer.id ? (
                <input
                  className="drawing-layer-input"
                  value={name}
                  autoFocus
                  maxLength={30}
                  aria-label="Layer name"
                  onChange={event => setName(event.target.value)}
                  onBlur={() => rename(layer.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') rename(layer.id);
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="drawing-layer-name"
                  aria-pressed={layer.id === active}
                  title="Click to draw on this layer, double-click to rename it"
                  onClick={() => onActivate(layer.id)}
                  onDoubleClick={() => {
                    setRenaming(layer.id);
                    setName(layer.name);
                  }}
                >
                  {layer.name}
                </button>
              )}
              <button type="button" className="drawing-layer-button" data-tooltip="Move up" aria-label={`Move ${layer.name} up`} disabled={index === layers.length - 1} onClick={() => save(moveLayer(layers, layer.id, 1))}>
                <Icon name="arrow-up" size={14} />
              </button>
              <button type="button" className="drawing-layer-button" data-tooltip="Move down" aria-label={`Move ${layer.name} down`} disabled={index === 0} onClick={() => save(moveLayer(layers, layer.id, -1))}>
                <Icon name="arrow-down" size={14} />
              </button>
              <button
                type="button"
                className="drawing-layer-button"
                data-tooltip="Remove layer and its strokes"
                data-tooltip-align="end"
                aria-label={`Remove ${layer.name}`}
                disabled={drawingLayers.length <= 1}
                onClick={() => remove(layer.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
