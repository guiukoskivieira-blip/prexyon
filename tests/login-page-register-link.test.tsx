import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginPage } from '../../src/pages/Login/LoginPage';

describe('LoginPage register link', () => {
  it('calls onRegisterClick when Criar conta is clicked', () => {
    const mockRegister = jest.fn();
    render(<LoginPage onRegisterClick={mockRegister} hasPendingInvite={false} />);
    const link = screen.getByRole('button', { name: /Criar conta/i });
    fireEvent.click(link);
    expect(mockRegister).toHaveBeenCalled();
  });
});
