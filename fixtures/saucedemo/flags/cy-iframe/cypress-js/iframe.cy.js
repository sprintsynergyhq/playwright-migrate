describe('Iframe Access', () => {
  it('clicks a button inside an iframe', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('iframe').its('0.contentDocument.body').find('button').click();
  });
});
