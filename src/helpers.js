export const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const findTreeNode = ({ nodes, nodeId }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      continue;
    }

    if (node.id === nodeId) {
      return node;
    }

    const nestedNode = findTreeNode({
      nodes: node.children,
      nodeId,
    });

    if (nestedNode) {
      return nestedNode;
    }
  }

  return undefined;
};

export const findTreeParentId = ({ nodes, nodeId, parentId = null }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      continue;
    }

    if (node.id === nodeId) {
      return parentId;
    }

    const nestedParentId = findTreeParentId({
      nodes: node.children,
      nodeId,
      parentId: node.id,
    });

    if (nestedParentId !== undefined) {
      return nestedParentId;
    }
  }

  return undefined;
};

const getSiblingNodes = ({ tree, parentId }) => {
  if (parentId === null || parentId === undefined) {
    return tree;
  }

  const parentNode = findTreeNode({
    nodes: tree,
    nodeId: parentId,
  });

  if (!Array.isArray(parentNode.children)) {
    parentNode.children = [];
  }

  return parentNode.children;
};

const resolveInsertIndex = ({ siblings, index, position, positionTargetId }) => {
  if (Number.isInteger(index)) {
    return Math.max(0, Math.min(index, siblings.length));
  }

  if (position === "first") {
    return 0;
  }

  if (position === "before" && isNonEmptyString(positionTargetId)) {
    return Math.max(0, siblings.findIndex((entry) => entry.id === positionTargetId));
  }

  if (position === "after" && isNonEmptyString(positionTargetId)) {
    const targetIndex = siblings.findIndex((entry) => entry.id === positionTargetId);
    return targetIndex >= 0 ? targetIndex + 1 : siblings.length;
  }

  return siblings.length;
};

export const insertTreeNode = ({
  tree,
  node,
  parentId = null,
  index,
  position,
  positionTargetId,
}) => {
  const siblings = getSiblingNodes({
    tree,
    parentId,
  });

  const insertIndex = resolveInsertIndex({
    siblings,
    index,
    position,
    positionTargetId,
  });

  siblings.splice(insertIndex, 0, node);
};

export const insertScopedTreeNode = ({
  tree,
  node,
  parentId = null,
  index,
  position,
  positionTargetId,
  isSibling,
}) => {
  const siblings = getSiblingNodes({
    tree,
    parentId,
  });

  const matchingIndexes = siblings
    .map((entry, entryIndex) => (isSibling(entry) ? entryIndex : -1))
    .filter((entryIndex) => entryIndex >= 0);

  let insertIndex = siblings.length;

  if (Number.isInteger(index)) {
    if (matchingIndexes.length === 0) {
      insertIndex = Math.max(0, Math.min(index, siblings.length));
    } else if (index <= 0) {
      insertIndex = matchingIndexes[0];
    } else if (index >= matchingIndexes.length) {
      insertIndex = matchingIndexes[matchingIndexes.length - 1] + 1;
    } else {
      insertIndex = matchingIndexes[index];
    }
  } else if (position === "first") {
    insertIndex = matchingIndexes[0] ?? siblings.length;
  } else if (position === "before" && isNonEmptyString(positionTargetId)) {
    const targetIndex = siblings.findIndex((entry) => entry.id === positionTargetId);
    insertIndex = targetIndex >= 0 ? targetIndex : siblings.length;
  } else if (position === "after" && isNonEmptyString(positionTargetId)) {
    const targetIndex = siblings.findIndex((entry) => entry.id === positionTargetId);
    insertIndex = targetIndex >= 0 ? targetIndex + 1 : siblings.length;
  } else if (matchingIndexes.length > 0) {
    insertIndex = matchingIndexes[matchingIndexes.length - 1] + 1;
  }

  siblings.splice(insertIndex, 0, node);
};

export const removeTreeNode = ({ nodes, nodeId }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node !== "object") {
      continue;
    }

    if (node.id === nodeId) {
      return nodes.splice(index, 1)[0];
    }

    const removedNode = removeTreeNode({
      nodes: node.children,
      nodeId,
    });

    if (removedNode) {
      return removedNode;
    }
  }

  return undefined;
};

const walkTree = ({ nodes, visit }) => {
  if (!Array.isArray(nodes)) {
    return;
  }

  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      continue;
    }

    visit(node);
    walkTree({
      nodes: node.children,
      visit,
    });
  }
};

export const collectTreeDescendantIds = ({ node, includeRoot = true }) => {
  const ids = [];

  if (!node || typeof node !== "object") {
    return ids;
  }

  walkTree({
    nodes: [node],
    visit: (entry) => {
      if (entry === node && includeRoot === false) {
        return;
      }
      ids.push(entry.id);
    },
  });

  return ids;
};
