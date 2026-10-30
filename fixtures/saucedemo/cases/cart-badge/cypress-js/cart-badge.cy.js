describe('Cart Badge', () => {
  beforeEach(() => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('standard_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
  });

  it('counts items as they are added and removed', () => {
    cy.get('[data-test="inventory-item"]').eq(0).find('button').click();
    cy.get('[data-test="shopping-cart-badge"]').should('have.text', '1');
    cy.get('[data-test="inventory-item"]')
      .last()
      .within(() => {
        cy.get('button').click();
      });
    cy.get('[data-test="shopping-cart-badge"]').should('have.text', '2');
    cy.get('[data-test="remove-sauce-labs-backpack"]').click();
    cy.get('[data-test="shopping-cart-badge"]').should('have.text', '1');
    cy.get('[data-test="inventory-item"]').last().find('button').click();
    cy.get('[data-test="shopping-cart-badge"]').should('not.exist');
  });
});
