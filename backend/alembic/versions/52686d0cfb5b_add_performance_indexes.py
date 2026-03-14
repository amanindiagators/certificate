"""Add performance indexes

Revision ID: 52686d0cfb5b
Revises: ced13e2f8c31
Create Date: 2026-03-13 15:58:59.419198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52686d0cfb5b'
down_revision: Union[str, Sequence[str], None] = 'ced13e2f8c31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Certificates indexes
    op.create_index(op.f('ix_certificates_category'), 'certificates', ['category'], unique=False)
    op.create_index(op.f('ix_certificates_created_at'), 'certificates', ['created_at'], unique=False)
    op.create_index(op.f('ix_certificates_user_id'), 'certificates', ['user_id'], unique=False)
    
    # History indexes
    op.create_index(op.f('ix_history_action_type'), 'history', ['action_type'], unique=False)
    op.create_index(op.f('ix_history_timestamp'), 'history', ['timestamp'], unique=False)
    op.create_index(op.f('ix_history_user_id'), 'history', ['user_id'], unique=False)
    
    # Sessions indexes
    op.create_index(op.f('ix_sessions_temp_access_id'), 'sessions', ['temp_access_id'], unique=False)
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    
    # TemporaryAccess indexes
    op.create_index(op.f('ix_temporary_access_user_id'), 'temporary_access', ['user_id'], unique=False)
    
    # Users indexes
    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_index(op.f('ix_temporary_access_user_id'), table_name='temporary_access')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_index(op.f('ix_sessions_temp_access_id'), table_name='sessions')
    op.drop_index(op.f('ix_history_user_id'), table_name='history')
    op.drop_index(op.f('ix_history_timestamp'), table_name='history')
    op.drop_index(op.f('ix_history_action_type'), table_name='history')
    op.drop_index(op.f('ix_certificates_user_id'), table_name='certificates')
    op.drop_index(op.f('ix_certificates_created_at'), table_name='certificates')
    op.drop_index(op.f('ix_certificates_category'), table_name='certificates')
