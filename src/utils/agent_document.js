function getAgentDocumentFolder(agentType) {
  if (agentType === 'CORPORATE') {
    return 'public/agents/nib';
  }

  return 'public/agents/id_card_photo';
}

module.exports = { getAgentDocumentFolder };