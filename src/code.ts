figma.showUI(__html__, { width: 400, height: 550 });

interface ShapeCounts {
  rectangles: number;
  ellipses: number;
  polygons: number;
  stars: number;
  lines: number;
  vectors: number;
  cores: number;
}


interface Coordinates {
  x: number;
  y: number;
}

function countShapes(node: SceneNode, shapeCounts: ShapeCounts) {
  if (node.type === 'RECTANGLE') {
    shapeCounts.rectangles++;
  } else if (node.type === 'ELLIPSE') {
    shapeCounts.ellipses++;
  } else if (node.type === 'POLYGON') {
    shapeCounts.polygons++;
  } else if (node.type === 'STAR') {
    shapeCounts.stars++;
  } else if (node.type === 'LINE') {
    shapeCounts.lines++;
  } else if (node.type === 'VECTOR') {
    shapeCounts.vectors++;
  }
  if (node.name && node.name.toLowerCase() === 'core') {
    shapeCounts.cores++;
  }
}

function extractCoordinates(pathData: string): Coordinates[] {
  const commands = pathData.match(/[a-df-z][^a-df-z]*/gi);
  const coordinates: Coordinates[] = [];
  if (commands) {
    commands.forEach(command => {
      const [type, ...coords] = command.split(/(?<=^\S)\s/);
      const nums = coords.join('').trim().split(/[\s,]+/).map(Number);
      switch (type) {
        case 'M':
        case 'L':
          coordinates.push({ x: nums[0], y: nums[1] });
          break;
        case 'C':
          coordinates.push(
            { x: nums[0], y: nums[1] },
            { x: nums[2], y: nums[3] },
            { x: nums[4], y: nums[5] }
          );
          break;
        case 'Z':
          break;
      }
    });
  }
  return coordinates;
}

function convertToGlobal(x_group: number, y_group: number, theta_group: number, x_local: number, y_local: number): { x: number, y: number } {
  const cosTheta = Math.cos(theta_group);
  const sinTheta = Math.sin(theta_group);
  const x_global = x_group + x_local * cosTheta - y_local * sinTheta;
  const y_global = y_group + x_local * sinTheta + y_local * cosTheta;
  return { x: x_global, y: y_global };
}

function lowercaseFirstLetter(string: string) {
  if (string.length === 0) return string;
  return string.charAt(0).toLowerCase() + string.slice(1);
}

function updateSelectionInfo() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'entity-infos', entityInfo: 'Sélectionner une entité. (groupe)' });
    figma.ui.postMessage({ type: 'entity-config', entityConfig: '_' });
    figma.ui.postMessage({ type: 'entity-data', entityData: '_' });
    return;
  }

  let entityInfo = '';
  let entityConfig = '';
  let entityData = '';

  selection.forEach(node => {
    if (node.type === 'GROUP') {
      const shapeCounts: ShapeCounts = {
        rectangles: 0,
        ellipses: 0,
        polygons: 0,
        stars: 0,
        lines: 0,
        vectors: 0,
        cores: 0
      };

      const groupNode = node as GroupNode;
      const theta_group = 0;

      node.name = lowercaseFirstLetter(node.name);
      entityConfig += `const ${node.name} = {\n`
      entityData += `{\n`;
      entityData += `    "${node.name}": {\n`;

      groupNode.children.forEach((shape, index) => {
        countShapes(shape, shapeCounts);
        const totalShapes = groupNode.children.length;
        const x_local = shape.x;
        const y_local = shape.y;
        const transform = shape.relativeTransform;
        const scaleX = transform[0][0];
        const isFlippedHorizontal = scaleX < 0;
        const globalCoords = convertToGlobal(groupNode.x, groupNode.y, theta_group, x_local, y_local);
        let theta_shape = Math.atan2(transform[1][0], transform[0][0]);
        let fillColor = '#2D2D2D';

        if ('fills' in shape && Array.isArray(shape.fills) && shape.fills.length > 0 && shape.fills[0].type === 'SOLID') {
          const fill = shape.fills[0].color;
          fillColor = `rgba(${Math.round(fill.r * 255)}, ${Math.round(fill.g * 255)}, ${Math.round(fill.b * 255)}, ${fill.opacity || 1})`;
        }

        shape.name = lowercaseFirstLetter(shape.name);
        entityData += `        "${shape.name}": [\n`;
        entityConfig += `    ${shape.name}: {\n`
        entityConfig += `        scaleFactor: 3.5,\n`
        entityConfig += `        origin: { x: ${parseFloat(globalCoords.x.toFixed(3))}, y: ${parseFloat(globalCoords.y.toFixed(3))} },\n`

        if (theta_shape == 0) {
          entityConfig += '';
        } else {
          entityConfig += `        rotation: ${parseFloat(theta_shape.toFixed(4))},\n`;
        }
        entityConfig += `        offset: { x: 0, y: 0 },\n`
        if (isFlippedHorizontal) {
          entityConfig += `        scaleY: -1,\n`;
        }
        entityConfig += `        fillStyle: '${fillColor}'\n`
        if (index === totalShapes - 1) {
          entityConfig += `    }\n`;
        } else {
          entityConfig += `    },\n`
        }

        type Coordinate = { x: number, y: number };
        let allCoords: Coordinate[] = [];
        if ('vectorPaths' in shape && Array.isArray(shape.vectorPaths)) {
          const seenCoords = new Set();
          shape.vectorPaths.forEach(vectorPath => {
            const pathCoords = extractCoordinates(vectorPath.data);
            pathCoords.forEach(coord => {
              const coordKey = `${coord.x},${coord.y}`;
              if (!seenCoords.has(coordKey)) {
                seenCoords.add(coordKey);
                allCoords.push(coord);
              }
            });
          });
        }
        allCoords.forEach((coord, index) => {
          if (index === allCoords.length - 1) {
            entityData += `            { "x": ${parseFloat(coord.x.toFixed(3))}, "y": ${parseFloat(coord.y.toFixed(3))} }\n`;
          } else {
            entityData += `            { "x": ${parseFloat(coord.x.toFixed(3))}, "y": ${parseFloat(coord.y.toFixed(3))} },\n`;
          }
        });
        if (index === totalShapes - 1) {
          entityData += `        ]\n`;
        } else {
          entityData += `        ],\n`
        }
      });

      entityConfig += `};\n`
      entityConfig += `export default ${node.name};\n`
      entityData += `    }\n`
      entityData += `}\n`

      const totalShapes =
        shapeCounts.rectangles +
        shapeCounts.ellipses +
        shapeCounts.polygons +
        shapeCounts.stars +
        shapeCounts.lines +
        shapeCounts.vectors +
        shapeCounts.cores;

      entityInfo += `Entity: ${node.name} </br>`;

      if (shapeCounts.rectangles > 0) {
        entityInfo += `Rectangles: <span style='color: red;'>${shapeCounts.rectangles}</span> </br>`;
      }
      if (shapeCounts.ellipses > 0) {
        entityInfo += `Ellipses: <span style='color: red;'>${shapeCounts.ellipses}</span> </br>`;
      }
      if (shapeCounts.polygons > 0) {
        entityInfo += `Polygons: <span style='color: red;'>${shapeCounts.polygons}</span> </br>`;
      }
      if (shapeCounts.stars > 0) {
        entityInfo += `Stars: <span style='color: red;'>${shapeCounts.stars}</span> </br>`;
      }
      if (shapeCounts.lines > 0) {
        entityInfo += `Lines: <span style='color: red;'>${shapeCounts.lines}</span> </br>`;
      }
      if (shapeCounts.vectors > 0) {
        entityInfo += `Vectors: ${shapeCounts.vectors} </br>`;
      }

      entityInfo += `Core: ${shapeCounts.cores > 0 ? shapeCounts.cores : "<span style='color: red;'>0</span>"} </br>`;
      entityInfo += `Total: ${totalShapes}</br>`;
    }
  });

  if (entityInfo === '') {
    entityInfo = 'Cette sélection n\'est pas un groupe.';
  }

  figma.ui.onmessage = (msg: { type: string }) => {
    if (msg.type === 'copy-entity-config') {
      copyToClipboard(entityConfig);
    } else if (msg.type === 'copy-entity-data') {
      copyToClipboard(entityData);
    }
  };

  function copyToClipboard(text: string) {
    figma.ui.postMessage({ type: 'copy', text: text });
  }

  figma.ui.postMessage({ type: 'entity-infos', entityInfo });
  figma.ui.postMessage({ type: 'entity-config', entityConfig });
  figma.ui.postMessage({ type: 'entity-data', entityData });
}

figma.on('selectionchange', () => {
  updateSelectionInfo();
});

updateSelectionInfo();