"""wt_report_lib: modular helpers for wt_report.py"""

from . import config as _config
from . import jira as _jira
from . import date_utils as _date_utils
from . import compute as _compute
from . import formatters as _formatters
from . import gchat as _gchat
from . import logger as _logger


def _export_public(module):
    """
    Populate this package's global namespace with the public attributes of
    the given submodule and return the list of exported names.

    Public attributes are determined by the submodule's __all__ if present,
    otherwise by all attributes that do not start with an underscore.
    """
    public_names = getattr(module, "__all__", None)
    if public_names is None:
        public_names = [name for name in dir(module) if not name.startswith("_")]
    for name in public_names:
        globals()[name] = getattr(module, name)
    return list(public_names)


__all__ = []
__all__ += _export_public(_config)
__all__ += _export_public(_jira)
__all__ += _export_public(_date_utils)
__all__ += _export_public(_compute)
__all__ += _export_public(_formatters)
__all__ += _export_public(_gchat)
__all__ += _export_public(_logger)
