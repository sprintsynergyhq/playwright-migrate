describe('Then Callback', () => {
  it('reads the title in a then callback', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('standard_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
    cy.get('[data-test="title"]').then(($title) => {
      expect($title.text()).to.equal('Products');
    });
  });
});
